// Host half for the preset-manager UI plugin. The browser half ships through
// package.json `dsh.client` + exports["./client"]; the host side has no behavior
// of its own (the switching RPC lives in the separate dsh-preset-manager plugin's
// `/preset` command).
export function apply() {}
