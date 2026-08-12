return {
  -- 1. Disable the default TokyoNight theme
  { "folke/tokyonight.nvim", enabled = false },

  -- 2. Setup mini.base16 using the NEW repository name
  {
    "nvim-mini/mini.base16", -- <--- CHANGED THIS LINE
    lazy = false,
    priority = 1000,
    config = function()
      local ok, palette = pcall(require, "wallust_colors")

      if not ok then
        vim.notify("Wallust colors not found! Run 'wallust run'.", vim.log.levels.WARN)
        require("mini.base16").setup()
        return
      end

      require("mini.base16").setup({
        palette = palette,
      })
    end,
  },

  -- 3. Ensure LazyVim doesn't override it
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = function() end,
    },
  },
}
