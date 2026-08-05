import { defineConfig, configDefaults } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // 에이전트 작업용 worktree 안에도 레포 사본이 통째로 있어서, 제외하지 않으면
    // 같은 테스트가 worktree 수만큼 중복 실행된다(그리고 오래된 사본이 실패로 잡힌다).
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**", "**/.codex/worktrees/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
})
