package auth

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/dekeky/rssmanager/pkg/ginx"
	finclawconfig "github.com/finclaw/internal/config"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	store  *Store
	mailer *Mailer
}

func NewHandler(store *Store, finclawConf *finclawconfig.FinclawConfig) *Handler {
	var smtpCfg *finclawconfig.SMTPSettings
	if finclawConf != nil && finclawConf.FinclawConfigServer != nil {
		smtpCfg = finclawConf.SMTP
	}
	return &Handler{
		store:  store,
		mailer: NewMailer(smtpCfg),
	}
}

func (h *Handler) verificationEnabled() bool {
	return h.mailer.Enabled()
}

type sendCodeReq struct {
	Email   string `json:"email" binding:"required"`
	Purpose string `json:"purpose" binding:"required,oneof=register reset_password"`
}

type registerReq struct {
	Account     string `json:"account" binding:"required,min=3,max=64"`
	Email       string `json:"email"`
	Password    string `json:"password" binding:"required,min=6"`
	DisplayName string `json:"display_name" binding:"required"`
	Code        string `json:"code"`
}

type resetPasswordReq struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required,min=6"`
	Code     string `json:"code" binding:"required,len=6"`
}

type loginReq struct {
	Account  string `json:"account" binding:"required,min=3,max=64"`
	Password string `json:"password" binding:"required"`
}

type authResp struct {
	AccessToken string   `json:"access_token"`
	User        userResp `json:"user"`
}

type userResp struct {
	ID          string `json:"id"`
	Account     string `json:"account"`
	DisplayName string `json:"display_name"`
}

type authConfigResp struct {
	EmailVerificationEnabled bool `json:"email_verification_enabled"`
}

func (h *Handler) Config(c *gin.Context) {
	ginx.NewRender(c).Data(authConfigResp{
		EmailVerificationEnabled: h.verificationEnabled(),
	})
}

func (h *Handler) SendCode(c *gin.Context) {
	if !h.verificationEnabled() {
		ginx.NewRender(c, http.StatusBadRequest).Err(ErrVerificationNotConfigured)
		return
	}

	var req sendCodeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	email, err := NormalizeEmail(req.Email)
	if err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	switch req.Purpose {
	case PurposeRegister:
		existing, err := h.store.GetUserByEmail(email)
		if err != nil {
			ginx.NewRender(c, http.StatusInternalServerError).Err(err)
			return
		}
		if existing != nil {
			ginx.NewRender(c, http.StatusConflict).Err(ErrEmailAlreadyExists)
			return
		}
	case PurposeResetPassword:
		user, err := h.store.GetUserByLogin(email)
		if err != nil {
			ginx.NewRender(c, http.StatusInternalServerError).Err(err)
			return
		}
		if user == nil {
			ginx.NewRender(c, http.StatusNotFound).Err(ErrEmailNotFound)
			return
		}
	}

	code, err := h.store.CreateVerificationCode(email, req.Purpose)
	if err != nil {
		if errors.Is(err, ErrSendTooFrequent) {
			ginx.NewRender(c, http.StatusTooManyRequests).Err(err)
			return
		}
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}

	if err := h.mailer.SendVerificationCode(email, code, req.Purpose); err != nil {
		_ = h.store.DeleteVerificationCodes(email, req.Purpose)
		if errors.Is(err, ErrSMTPSendFailed) {
			ginx.NewRender(c, http.StatusBadGateway).Err(errors.New(formatMailError(err)))
			return
		}
		ginx.NewRender(c, http.StatusBadGateway).Err(err)
		return
	}

	ginx.NewRender(c).Data(gin.H{"message": "verification code sent"})
}

func (h *Handler) Register(c *gin.Context) {
	var req registerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	account, err := NormalizeAccountName(req.Account)
	if err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	existingAccount, err := h.store.GetUserByAccount(account)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	if existingAccount != nil {
		ginx.NewRender(c, http.StatusConflict).Err(ErrAccountAlreadyExists)
		return
	}

	var email string
	if h.verificationEnabled() {
		email, err = NormalizeEmail(req.Email)
		if err != nil {
			ginx.NewRender(c, http.StatusBadRequest).Err(err)
			return
		}
		code := strings.TrimSpace(req.Code)
		if code == "" {
			ginx.NewRender(c, http.StatusBadRequest).Err(errors.New("verification code required"))
			return
		}
		if err := h.store.ConsumeVerificationCode(email, PurposeRegister, code); err != nil {
			status := http.StatusBadRequest
			if errors.Is(err, ErrCodeExpired) || errors.Is(err, ErrCodeInvalid) {
				status = http.StatusUnauthorized
			}
			ginx.NewRender(c, status).Err(err)
			return
		}
		existingEmail, err := h.store.GetUserByEmail(email)
		if err != nil {
			ginx.NewRender(c, http.StatusInternalServerError).Err(err)
			return
		}
		if existingEmail != nil {
			ginx.NewRender(c, http.StatusConflict).Err(ErrEmailAlreadyExists)
			return
		}
	}

	user, err := h.store.CreateUser(account, email, req.Password, req.DisplayName)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}

	token, err := GenerateToken(user.ID, 24*time.Hour)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}

	ginx.NewRender(c, http.StatusCreated).Data(authResp{
		AccessToken: token,
		User:        userResp{ID: user.ID, Account: user.Account, DisplayName: user.DisplayName},
	})
}

func (h *Handler) ResetPassword(c *gin.Context) {
	if !h.verificationEnabled() {
		ginx.NewRender(c, http.StatusBadRequest).Err(ErrVerificationNotConfigured)
		return
	}

	var req resetPasswordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	email, err := NormalizeEmail(req.Email)
	if err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	if err := h.store.ConsumeVerificationCode(email, PurposeResetPassword, req.Code); err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, ErrCodeExpired) || errors.Is(err, ErrCodeInvalid) {
			status = http.StatusUnauthorized
		}
		ginx.NewRender(c, status).Err(err)
		return
	}

	if err := h.store.UpdatePasswordByEmail(email, req.Password); err != nil {
		if errors.Is(err, ErrEmailNotFound) {
			ginx.NewRender(c, http.StatusNotFound).Err(err)
			return
		}
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}

	ginx.NewRender(c).Data(gin.H{"message": "password reset successful"})
}

func (h *Handler) Login(c *gin.Context) {
	var req loginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	user, err := h.store.GetUserByLogin(req.Account)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	if user == nil || !CheckPassword(user.PasswordHash, req.Password) {
		ginx.NewRender(c, http.StatusUnauthorized).Err(errors.New("invalid account or password"))
		return
	}

	token, err := GenerateToken(user.ID, 24*time.Hour)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}

	ginx.NewRender(c).Data(authResp{
		AccessToken: token,
		User:        userResp{ID: user.ID, Account: user.Account, DisplayName: user.DisplayName},
	})
}

func (h *Handler) Refresh(c *gin.Context) {
	userID := GetUserID(c)
	if userID == "" {
		ginx.NewRender(c, http.StatusUnauthorized).Err(errors.New("not authenticated"))
		return
	}

	token, err := GenerateToken(userID, 24*time.Hour)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}

	ginx.NewRender(c).Data(gin.H{"access_token": token})
}

func (h *Handler) Me(c *gin.Context) {
	userID := GetUserID(c)
	if userID == "" {
		ginx.NewRender(c, http.StatusUnauthorized).Err(errors.New("not authenticated"))
		return
	}

	user, err := h.store.GetUserByID(userID)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	if user == nil {
		ginx.NewRender(c, http.StatusUnauthorized).Err(errors.New("user not found"))
		return
	}

	ginx.NewRender(c).Data(userResp{
		ID:          user.ID,
		Account:     user.Account,
		DisplayName: user.DisplayName,
	})
}

const contextUserIDKey = "userId"

func AuthMiddleware(store *Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			if token := c.Query("token"); token != "" {
				authHeader = "Bearer " + token
			}
		}

		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authorization required"})
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenStr == authHeader {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization format"})
			return
		}

		claims, err := ParseToken(tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		user, err := store.GetUserByID(claims.UserID)
		if err != nil || user == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}

		c.Set(contextUserIDKey, user.ID)
		c.Next()
	}
}

func GetUserID(c *gin.Context) string {
	v, _ := c.Get(contextUserIDKey)
	if id, ok := v.(string); ok {
		return id
	}
	return ""
}
