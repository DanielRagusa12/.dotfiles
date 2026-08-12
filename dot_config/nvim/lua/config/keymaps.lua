-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here
--
--
-- Search specifically in the ~/.config directory
-- Keybind: Space + f + Shift+c
vim.keymap.set("n", "<leader>fC", function()
  LazyVim.pick("files", { cwd = "~/.config" })()
end, { desc = "Find in .config dir" })
