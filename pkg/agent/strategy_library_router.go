package agentruntime

import (
	"encoding/json"
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
	paper          *PaperRouter
}

func NewStrategyLibraryRouter(r *gin.Engine, authMiddleware gin.HandlerFunc, authStore *auth.Store, paper *PaperRouter) *StrategyLibraryRouter {
	return &StrategyLibraryRouter{r: r, authMiddleware: authMiddleware, authStore: authStore, paper: paper}
}

func (lr *StrategyLibraryRouter) ConfigRouter() {
	public := lr.r.Group("/api/v1/strategy-library")
	public.GET("", lr.listEntries)
	public.GET("/:id", lr.getEntry)

	authed := lr.r.Group("/api/v1/strategy-library", lr.authMiddleware)
	authed.POST("", lr.shareStrategy)
	authed.POST("/:id/install", lr.installEntry)
	authed.DELETE("/:id", lr.deleteEntry)
}

type strategyLibraryListResp struct {
	Entries []gin.H `json:"entries"`
	Total   int     `json:"total"`
}

func (lr *StrategyLibraryRouter) listEntries(c *gin.Context) {
	entries, err := lr.authStore.ListStrategyLibrary(c.Query("search"))
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	out := make([]gin.H, 0, len(entries))
	for _, entry := range entries {
		lr.ensureLibraryPaper(&entry)
		out = append(out, lr.libraryCard(entry, false))
	}
	ginx.NewRender(c).Data(strategyLibraryListResp{Entries: out, Total: len(out)})
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
	lr.ensureLibraryPaper(&entry.StrategyLibrarySummary)
	if lr.paper != nil && entry.PaperSessionID != "" {
		if sess, loadErr := loadPaperSession(libraryPaperOwnerID, entry.PaperSessionID); loadErr == nil {
			if sess.Status == paperStatusRunning || sess.Status == paperStatusFailed {
				lr.paper.startSync(libraryPaperOwnerID, sess.ID, false)
			}
		}
	}
	ginx.NewRender(c).Data(lr.libraryDetail(*entry))
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

	runs, _ := snapshotLatestStrategyRuns(userID, detail.ID, detail.Name)
	runsJSON := "[]"
	if len(runs) > 0 {
		if encoded, marshalErr := json.Marshal(runs); marshalErr == nil {
			runsJSON = string(encoded)
			entry.RunsJSON = runsJSON
		}
	}
	fromRunID := firstSnapshotRunID(runs)
	if sess, paperErr := lr.paper.startLibraryPaper(libraryPaperSeed{
		EntryID:       entry.ID,
		Title:         entry.Title,
		Platform:      entry.Platform,
		Script:        entry.Script,
		FromRunUserID: userID,
		FromRunID:     fromRunID,
	}); paperErr == nil && sess.ID != "" {
		entry.PaperSessionID = sess.ID
	}
	if entry.PaperSessionID != "" || runsJSON != "[]" {
		_ = lr.authStore.UpdateStrategyLibraryLive(entry.ID, entry.PaperSessionID, runsJSON)
	}
	ginx.NewRender(c, http.StatusCreated).Data(lr.libraryDetail(*entry))
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

	created, err := NewStrategyStore(userID).Create(name, entry.Platform, entry.Script, "")
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "already exists") {
			status = http.StatusConflict
		}
		ginx.NewRender(c, status).Err(err)
		return
	}

	_ = lr.authStore.IncrementStrategyLibraryInstallCount(id)
	ginx.NewRender(c, http.StatusCreated).Data(created)
}

func (lr *StrategyLibraryRouter) deleteEntry(c *gin.Context) {
	userID := getUserID(c)
	id := strings.TrimSpace(c.Param("id"))
	entry, err := lr.authStore.GetStrategyLibraryEntry(id)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	if err := lr.authStore.DeleteStrategyLibraryEntry(userID, id); err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		ginx.NewRender(c, status).Err(err)
		return
	}
	if entry != nil && strings.TrimSpace(entry.PaperSessionID) != "" {
		_ = deletePaperSession(libraryPaperOwnerID, entry.PaperSessionID)
	}
	ginx.NewRender(c).Data(gin.H{"deleted": id})
}

func (lr *StrategyLibraryRouter) ensureLibraryPaper(entry *auth.StrategyLibrarySummary) {
	if entry == nil || lr.paper == nil || entry.Platform != StrategyPlatformFinClaw {
		return
	}
	if strings.TrimSpace(entry.PaperSessionID) != "" {
		if _, err := loadPaperSession(libraryPaperOwnerID, entry.PaperSessionID); err == nil {
			return
		}
	}
	full, err := lr.authStore.GetStrategyLibraryEntry(entry.ID)
	if err != nil || full == nil {
		return
	}
	sess, err := lr.paper.startLibraryPaper(libraryPaperSeed{
		EntryID:  full.ID,
		Title:    full.Title,
		Platform: full.Platform,
		Script:   full.Script,
	})
	if err != nil || sess.ID == "" {
		return
	}
	entry.PaperSessionID = sess.ID
	_ = lr.authStore.UpdateStrategyLibraryLive(entry.ID, sess.ID, "")
}

func (lr *StrategyLibraryRouter) libraryCard(entry auth.StrategyLibrarySummary, includePaper bool) gin.H {
	card := gin.H{
		"id":            entry.ID,
		"author_name":   entry.AuthorName,
		"title":         entry.Title,
		"summary":       entry.Summary,
		"platform":      entry.Platform,
		"source_name":   entry.SourceName,
		"install_count": entry.InstallCount,
		"created_at":    entry.CreatedAt,
		"updated_at":    entry.UpdatedAt,
	}
	if strings.TrimSpace(entry.PaperSessionID) == "" || lr.paper == nil {
		return card
	}
	sess, err := loadPaperSession(libraryPaperOwnerID, entry.PaperSessionID)
	if err != nil {
		return card
	}
	view := lr.paper.sessionView(libraryPaperOwnerID, sess, includePaper)
	card["paper_status"] = view["status"]
	card["go_live"] = view["go_live"]
	card["return_pct"] = view["return_pct"]
	card["equity"] = view["equity"]
	card["initial_cash"] = view["initial_cash"]
	card["last_bar_date"] = view["last_bar_date"]
	if curve, ok := view["equity_curve"]; ok {
		card["equity_curve"] = curve
	}
	if includePaper {
		card["paper"] = view
	}
	return card
}

func (lr *StrategyLibraryRouter) libraryDetail(entry auth.StrategyLibraryDetail) gin.H {
	card := lr.libraryCard(entry.StrategyLibrarySummary, true)
	card["script"] = entry.Script
	card["user_id"] = entry.UserID
	if runs := decodeLibraryRunsJSON(entry.RunsJSON); len(runs) > 0 {
		card["runs"] = runs
	}
	return card
}
