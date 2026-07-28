package agentruntime

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/dekeky/rssmanager/pkg/ginx"
	"github.com/finclaw/internal/auth"
	"github.com/gin-gonic/gin"
)

// StrategyLibraryRouter exposes the community strategy library.
type StrategyLibraryRouter struct {
	r              *gin.Engine
	authMiddleware gin.HandlerFunc
	authStore      *auth.Store
}

func NewStrategyLibraryRouter(r *gin.Engine, authMiddleware gin.HandlerFunc, authStore *auth.Store) *StrategyLibraryRouter {
	return &StrategyLibraryRouter{r: r, authMiddleware: authMiddleware, authStore: authStore}
}

func (lr *StrategyLibraryRouter) ConfigRouter() {
	group := lr.r.Group("/api/v1/strategy-library", lr.authMiddleware)
	group.GET("", lr.listEntries)
	group.GET("/:id", lr.getEntry)
	group.POST("", lr.shareStrategy)
	group.POST("/:id/install", lr.installEntry)
	group.DELETE("/:id", lr.deleteEntry)
}

type strategyLibraryListResp struct {
	Entries []auth.StrategyLibrarySummary `json:"entries"`
	Total   int                           `json:"total"`
}

func (lr *StrategyLibraryRouter) listEntries(c *gin.Context) {
	entries, err := lr.authStore.ListStrategyLibrary(c.Query("search"))
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ginx.NewRender(c).Data(strategyLibraryListResp{Entries: entries, Total: len(entries)})
}

func (lr *StrategyLibraryRouter) getEntry(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	entry, err := lr.authStore.GetStrategyLibraryEntry(id)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	if entry == nil {
		ginx.NewRender(c, http.StatusNotFound).Err(fmt.Errorf("strategy library entry not found"))
		return
	}
	ginx.NewRender(c).Data(entry)
}

type shareStrategyRequest struct {
	StrategyName string `json:"strategy_name" binding:"required"`
	Title        string `json:"title,omitempty"`
	Summary      string `json:"summary,omitempty"`
}

func (lr *StrategyLibraryRouter) shareStrategy(c *gin.Context) {
	userID := getUserID(c)
	var req shareStrategyRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))

	strategyName := strings.TrimSpace(req.StrategyName)
	if strategyName == "" {
		ginx.NewRender(c, http.StatusBadRequest).Err(fmt.Errorf("strategy name is required"))
		return
	}

	detail, err := NewStrategyStore(userID).Get(strategyName)
	if err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		ginx.NewRender(c, status).Err(err)
		return
	}

	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = detail.Name
	}

	user, err := lr.authStore.GetUserByID(userID)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	authorName := strategyName
	if user != nil {
		if dn := strings.TrimSpace(user.DisplayName); dn != "" {
			authorName = dn
		} else if ac := strings.TrimSpace(user.Account); ac != "" {
			authorName = ac
		}
	}

	entry, err := lr.authStore.CreateStrategyLibraryEntry(auth.CreateStrategyLibraryEntryParams{
		UserID:     userID,
		AuthorName: authorName,
		Title:      title,
		Summary:    strings.TrimSpace(req.Summary),
		Platform:   detail.Platform,
		Script:     detail.Script,
		SourceName: detail.Name,
	})
	if err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}
	ginx.NewRender(c, http.StatusCreated).Data(entry)
}

type installLibraryEntryRequest struct {
	Name string `json:"name" binding:"required"`
}

func (lr *StrategyLibraryRouter) installEntry(c *gin.Context) {
	userID := getUserID(c)
	id := strings.TrimSpace(c.Param("id"))
	var req installLibraryEntryRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))

	entry, err := lr.authStore.GetStrategyLibraryEntry(id)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	if entry == nil {
		ginx.NewRender(c, http.StatusNotFound).Err(fmt.Errorf("strategy library entry not found"))
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		ginx.NewRender(c, http.StatusBadRequest).Err(fmt.Errorf("strategy name is required"))
		return
	}

	detail, err := NewStrategyStore(userID).Create(name, entry.Platform, entry.Script, "")
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "already exists") {
			status = http.StatusConflict
		}
		ginx.NewRender(c, status).Err(err)
		return
	}

	_ = lr.authStore.IncrementStrategyLibraryInstallCount(id)
	ginx.NewRender(c, http.StatusCreated).Data(detail)
}

func (lr *StrategyLibraryRouter) deleteEntry(c *gin.Context) {
	userID := getUserID(c)
	id := strings.TrimSpace(c.Param("id"))
	if err := lr.authStore.DeleteStrategyLibraryEntry(userID, id); err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		ginx.NewRender(c, status).Err(err)
		return
	}
	ginx.NewRender(c).Data(gin.H{"deleted": id})
}
