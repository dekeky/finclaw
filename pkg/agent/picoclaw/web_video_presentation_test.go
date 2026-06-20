package picoclaw

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/sipeed/picoclaw/pkg/skills"
)

const webVideoPresentationFrontmatter = `---
name: web-video-presentation
description: 把一篇文章或口播稿，做成"看起来像视频"的点击驱动 16:9 网页演示，可选合成口播音频。流程：原始文章 → **一次产出**口播稿 + outline 开发计划 → 用户**一次对齐** 5 件事（稿子 / outline / 主题 / 素材 / 开发模式）→ 网页开发（逐章 / 顺序 / 并行）→ 可选音频合成（provider-agnostic：内置 MiniMax mmx-cli + OpenAI TTS，可换 ElevenLabs / edge-tts / Azure / 自带 TTS）。**outline 只规划节奏与信息密度，不规划动画** —— 动画由章节开发时按 PRINCIPLES + ANTI-AI 法则即时设计。每次点击推进口播稿的一个节拍，每一步独占整屏，进度条平时隐藏只在悬浮时出现。适用场景：用网页做视频（动态 PPT 但不像 PPT）、把口播稿 / 文章变成可交互的解说、为 B 站 / YouTube / 视频号录屏教程、做有电影感的产品 / talk demo。本 Skill 沉淀的是设计方法论 + 协作流程 —— 不绑定任何特定样式 / 字体 / 颜色 —— 因此能复用到任意主题与美学。
---

# Web Video Presentation

把一篇文章或口播稿，一步步做成可录屏的"伪装成视频的网页"，可选合成
口播音频。产出物 = Vite + React + TS 项目 + 按章节切分的音频。
`

func TestWebVideoPresentationSkillListed(t *testing.T) {
	tmp := t.TempDir()
	workspace := filepath.Join(tmp, "workspace")
	skillDir := filepath.Join(workspace, "skills", "web-video-presentation")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(webVideoPresentationFrontmatter), 0o644); err != nil {
		t.Fatal(err)
	}

	summary, err := ListAgentSkills(workspace)
	if err != nil {
		t.Fatalf("ListAgentSkills: %v", err)
	}
	if len(summary.Skills) != 1 {
		t.Fatalf("skills count = %d, want 1; skills=%+v", len(summary.Skills), summary.Skills)
	}
	s := summary.Skills[0]
	if s.Name != "web-video-presentation" {
		t.Fatalf("unexpected name: %+v", s)
	}
	if s.Source != "workspace" || s.Dir != "web-video-presentation" {
		t.Fatalf("unexpected source/dir: %+v", s)
	}
	if len(s.Description) <= skills.MaxDescriptionLength {
		t.Fatalf("description should not be truncated; len=%d max=%d", len(s.Description), skills.MaxDescriptionLength)
	}
}
