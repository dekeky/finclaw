package auth

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/dekeky/rssmanager/pkg/ginx"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

type registerReq struct {
	Account     string `json:"account" binding:"required,min=3,max=64"`
	Password    string `json:"password" binding:"required,min=6"`
	DisplayName string `json:"display_name" binding:"required"`
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

func (h *Handler) Register(c *gin.Context) {
	var req registerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	account := strings.TrimSpace(req.Account)
	existing, err := h.store.GetUserByAccount(account)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	if existing != nil {
		ginx.NewRender(c, http.StatusConflict).Err(errors.New("account already registered"))
		return
	}

	user, err := h.store.CreateUser(account, req.Password, req.DisplayName)
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

func (h *Handler) Login(c *gin.Context) {
	var req loginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	account := strings.TrimSpace(req.Account)
	user, err := h.store.GetUserByAccount(account)
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
			// Also check query param for WebSocket
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
