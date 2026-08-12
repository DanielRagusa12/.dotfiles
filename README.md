# Dotfiles

Managed with [chezmoi](https://www.chezmoi.io/).

## Daily workflow

```sh
chezmoi status
chezmoi diff
chezmoi edit --apply ~/.zshrc
chezmoi cd
```

Runtime-generated files such as Hyprland monitor and wallpaper state and
Wallust color outputs are intentionally not managed.

The repository intentionally manages only the active Zsh, Hyprland, Kitty,
Neovim, Rofi, Wallust, Waybar, and SSH agent configuration.
