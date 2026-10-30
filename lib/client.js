// Browser bundle for the session-header Agent-preset selector.
//
// Mirrors the Agent Team action's trigger/hover/panel language: the same
// 150ms hover-open, 120ms hover-close grace, click-to-pin, outside-pointer and
// Escape dismissal, and the same panel chrome (menu surface, 12px radius,
// elevation, scroll gutter). The read-only label shipped by
// @deepseek-ai/dsh-client-ui-agent-preset is hidden by a small scoped rule so
// this selector takes its slot position; the official new-session chip and the
// settings section stay untouched.
//
// Switching goes through the host plugin's `/preset <id>` command
// (dsh-preset-manager), which rebinds the live Agent scope, appends
// `agent-preset/selected`, and injects the preset-change notice before the next
// model request. Conversation history is never touched.
window.__ModuleLoader__.load({
	id: "dsh-preset-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const ReactDOM = require("react-dom");
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		const h = React.createElement;

		/** Locale namespace owned by this surface. */
		const NS = "preset-manager";

		// ── styles ──────────────────────────────────────────────────────────
		const CSS_ID = "dsh-preset-manager/PresetSwitch.module.css";
		const css =
			".psw_root{position:relative}" +
			".psw_trigger{min-height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:6px;align-items:center;gap:5px;padding:3px 7px;font-size:12px;display:inline-flex}" +
			".psw_triggerPrefix{flex:none;color:var(--dsw-alias-label-caption);font-size:11px}" +
			".psw_trigger:hover,.psw_trigger:focus-visible{color:var(--dsw-alias-label-primary)}" +
			"@container (width<=480px){.psw_triggerLabel{display:none}}" +
			".psw_panel{--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);z-index:100;box-sizing:border-box;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:min(380px,100vw - 32px);max-height:min(560px,100vh - 32px);box-shadow:var(--dsw-elevation-prominent);border:0;border-radius:12px;flex-direction:column;padding:8px 2px 0;display:flex;position:fixed;overflow:hidden}" +
			'.psw_panel:before{content:"";z-index:-1;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);border-radius:12px;position:absolute;inset:0}' +
			".psw_body{--dsh-scrollbar-track-margin:8px;scrollbar-gutter:stable;flex:auto;min-height:0;padding:0 9px 16px 14px;overflow-y:auto}" +
			".psw_body h3{color:var(--dsw-alias-label-primary);align-items:center;gap:8px;margin:16px 0 8px 4px;font-size:13px;font-weight:500;display:flex}" +
			".psw_body section:first-of-type h3{margin-top:8px}" +
			".psw_count{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;font-size:12px;font-weight:400;line-height:16px}" +
			".psw_list{flex-direction:column;gap:7px;display:flex}" +
			".psw_item{--dsw-elevation-stroke-color:var(--dsw-alias-border-l2);position:relative;box-shadow:var(--dsw-elevation-stroke);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;border:0;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:3px;min-width:0;transition:box-shadow .18s ease}" +
			'.psw_item::after{content:"";position:absolute;inset:0;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover);opacity:0;transition:opacity .16s ease;pointer-events:none;z-index:1}' +
			".psw_item:not(:disabled):hover::after,.psw_item:not(:disabled):focus-visible::after{opacity:1}" +
			".psw_item:disabled{cursor:default;opacity:.7}" +
			".psw_item:not(:disabled):hover,.psw_item:not(:disabled):focus-visible{box-shadow:var(--dsw-elevation-panel)}" +
			".psw_itemCurrent{--psw-ring:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,transparent);--dsw-elevation-stroke-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 40%,transparent);box-shadow:var(--dsw-elevation-stroke),var(--psw-ring)}" +
			".psw_itemCurrent:not(:disabled):hover,.psw_itemCurrent:not(:disabled):focus-visible{box-shadow:var(--dsw-elevation-panel),var(--psw-ring)}" +
			".psw_itemName{align-items:center;gap:5px;min-width:0;display:flex;font-size:13px;line-height:20px}" +
			".psw_itemNameText{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}" +
			".psw_currentTag{flex:0 0 auto;padding:0 4px;font-size:10px;line-height:15px}" +
			".psw_itemId{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}" +
			".psw_itemDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:17px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
			".psw_hint{color:var(--dsw-alias-label-tertiary);margin:12px 0 0 4px;font-size:11px;line-height:16px}" +
			".psw_notice,.psw_error{align-items:center;gap:6px;padding:9px;font-size:12px;display:flex}" +
			".psw_error{color:var(--dsw-alias-state-error-primary)}" +
			".psw_empty{color:var(--dsw-alias-label-tertiary);margin:16px 0 0 4px;font-size:12px}" +
			".psw_cmdRoot{flex-direction:column;display:flex}" +
			".psw_cmdTitle{font-weight:400}" +
			".psw_cmdSep{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}" +
			".psw_cmdSummary{min-width:0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));text-overflow:ellipsis;white-space:nowrap;flex:auto;overflow:hidden}" +
			".psw_cmdSummary[data-error]{color:var(--dsw-alias-state-error-primary)}" +
			".psw_cmdWarnDot{flex:none;margin-left:6px;color:var(--dsw-alias-state-warning-primary);font-size:12px;line-height:24px}" +
			".psw_cmdBody{margin:4px 0 4px 4px;padding:12px 16px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-markdown-code-block);max-height:260px;color:var(--dsw-alias-label-primary);font-size:12.5px;line-height:19px;overflow:auto;display:flex;flex-direction:column;gap:6px;animation:psw-card-open .16s ease}" +
			"@keyframes psw-card-open{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}" +
			".psw_cmdRow{display:flex;gap:6px;margin:0;flex-wrap:wrap}" +
			".psw_cmdLabel{color:var(--dsw-alias-label-tertiary);flex:none}" +
			".psw_cmdValue{color:var(--dsw-alias-label-primary);min-width:0;overflow-wrap:anywhere}" +
			".psw_cmdText{margin:0;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}" +
			".psw_cmdWarn{margin:2px 0 0;color:var(--dsw-alias-state-warning-primary);display:flex;gap:4px}" +
			".psw_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}" +
			".psw_formBody{flex-direction:column;gap:14px;display:flex}" +
			".psw_row{color:var(--dsw-alias-label-primary);justify-content:space-between;align-items:flex-start;gap:16px;font-size:13px;line-height:1.5;display:flex}" +
			".psw_rowMain{flex:1;min-width:0}" +
			".psw_rowHint{color:var(--dsw-alias-label-tertiary);margin:4px 0 0;font-size:12px;line-height:1.5}" +
			".psw_group{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}" +
			".psw_presetList{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);flex-direction:column;gap:10px;max-height:220px;padding:8px 12px;display:flex;overflow-y:auto}" +
			".psw_select{border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);height:32px;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;flex:none;max-width:220px;padding:0 8px;outline:none}" +
			".psw_grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px 18px;align-content:start}" +
			".psw_gridRow{display:grid;grid-template-columns:minmax(0,1fr) 56px 56px;gap:10px;align-items:center}" +
			".psw_colLabel{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;text-align:center}" +
			".psw_heading{margin:0;color:var(--dsw-alias-label-primary);font-size:18px;font-weight:600;line-height:26px}" +
			".psw_menuAnchor{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);height:30px;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;display:inline-flex;align-items:center;gap:6px;max-width:220px;padding:0 8px;cursor:pointer}" +
			".psw_menuAnchor:hover{background:var(--dsw-alias-bg-layer-4)}" +
			".psw_menuAnchor:disabled{cursor:default;opacity:.5}" +
			".psw_menuLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
			".psw_menuChevron{color:var(--dsw-alias-label-tertiary);flex:none}" +
			".psw_rowEnd{display:flex;align-items:center;gap:8px;flex:none}" +
			".psw_select:focus{border-color:var(--dsw-alias-state-business-primary)}" +
			".psw_boundary{white-space:pre-wrap;color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:1.5}" +
			".psw_error{white-space:pre-wrap;color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:1.5}" +
			".psw_emptyBoundary{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_ID) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-preset-manager";
			tag.dataset.pluginCss = CSS_ID;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		// The official read-only preset label keeps its slot item; hide just that
		// label so this selector occupies the same position in the header row.
		// (Class hash from @deepseek-ai/dsh-client-ui-agent-preset 0.2.1-rc.2.)
		const HIDE_ID = "dsh-preset-manager/hide-agent-preset-label";
		const hideCss = ".b06baG_label{display:none!important}";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(HIDE_ID) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-preset-manager";
			tag.dataset.pluginCss = HIDE_ID;
			tag.textContent = hideCss;
			document.head.appendChild(tag);
		}
		const S = {
			root: "psw_root",
			trigger: "psw_trigger",
			triggerPrefix: "psw_triggerPrefix",
			triggerLabel: "psw_triggerLabel",
			panel: "psw_panel",
			body: "psw_body",
			count: "psw_count",
			list: "psw_list",
			item: "psw_item",
			itemCurrent: "psw_itemCurrent",
			itemName: "psw_itemName",
			itemNameText: "psw_itemNameText",
			currentTag: "psw_currentTag",
			itemId: "psw_itemId",
			itemDesc: "psw_itemDesc",
			hint: "psw_hint",
			notice: "psw_notice",
			error: "psw_error",
			empty: "psw_empty",
			cmdRoot: "psw_cmdRoot",
			cmdTitle: "psw_cmdTitle",
			cmdSep: "psw_cmdSep",
			cmdSummary: "psw_cmdSummary",
			cmdWarnDot: "psw_cmdWarnDot",
			cmdBody: "psw_cmdBody",
			cmdRow: "psw_cmdRow",
			cmdLabel: "psw_cmdLabel",
			cmdValue: "psw_cmdValue",
			cmdText: "psw_cmdText",
			cmdWarn: "psw_cmdWarn",
			intro: "psw_intro",
			formBody: "psw_formBody",
			row: "psw_row",
			rowMain: "psw_rowMain",
			rowHint: "psw_rowHint",
			group: "psw_group",
			presetList: "psw_presetList",
			select: "psw_select",
			grid: "psw_grid",
			gridRow: "psw_gridRow",
			colLabel: "psw_colLabel",
			heading: "psw_heading",
			menuAnchor: "psw_menuAnchor",
			menuLabel: "psw_menuLabel",
			menuChevron: "psw_menuChevron",
			rowEnd: "psw_rowEnd",
			boundary: "psw_boundary",
			error: "psw_error"
		};

		// ── copy ────────────────────────────────────────────────────────────
		const zh = {
			trigger: "切换 Agent 预设",
			triggerPrefix: "预设",
			panelTitle: "Agent 预设",
			loading: "正在加载预设…",
			unavailable: "预设列表不可用",
			current: "当前",
			broken: "不可用",
			switching: "切换中…",
			failed: "切换失败：",
			hint: "切换后对话上下文保留，从下一轮起生效。",
			cardTitle: "预设",
			running: "切换中…",
			nav: "预设管理",
			pluginName: "预设管理器",
			settingsIntro: "控制预设管理工具与引导的启用范围，以及子代理可用的预设。",
			masterLabel: "总开关：启用预设管理",
			masterHint: "关闭后所有预设都不挂载预设管理工具与引导；逐预设状态会保留，重新打开即还原。",
			presetGroup: "按预设启用",
			subagentGroup: "子代理预设",
			inheritLabel: "默认预设：与父代理相同",
			inheritHint: "开启时子代理继承父代理当时的预设；关闭后需要指定一个默认预设。",
			defaultLabel: "默认预设",
			defaultHint: "创建子代理时省略 agent_preset 会使用它。",
			allowedLabel: "允许子代理使用的预设（全部开启表示不限制）",
			colGuidance: "工具/引导",
			colSubagent: "子代理可用",
			packageGroup: "预设包",
			packageHint: "导入的预设只能使用当前已安装的插件；依赖缺失插件的预设导入会失败并列出缺失项。",
			exportAction: "导出",
			exportDone: "已导出文件。",
			importAction: "导入…",
			save: "保存",
			saving: "保存中…",
			saveFailed: "本部署没有接受这些值，已保留供你修改。",
			readOnly: "本部署的设置为只读。",
			unavailable: "该插件当前未加载，暂时无法配置。",
			loadingPresets: "正在载入预设…",
			noPresets: "没有可配置的预设",
			itemsSummary: "管理预设：按预设启用工具与引导、子代理候选与默认预设、预设包导入导出。",
			standard: "标准模式",
			ptc: "PTC 模式",
			minimal: "极简模式",
			cordis: "创造模式"
		};
		const en = {
			trigger: "Switch agent preset",
			triggerPrefix: "Preset",
			panelTitle: "Agent presets",
			loading: "Loading presets…",
			unavailable: "Preset roster unavailable",
			current: "Current",
			broken: "Unavailable",
			switching: "Switching…",
			failed: "Could not switch: ",
			hint: "After switching, the conversation is kept; it takes effect from the next turn.",
			cardTitle: "Preset",
			running: "Switching…",
			nav: "Preset management",
			pluginName: "Preset manager",
			settingsIntro: "Choose where preset-management tools and guidance apply, and which presets subagents may use.",
			masterLabel: "Master switch: enable preset management",
			masterHint: "Turns off the preset-management tools and guidance for every preset; per-preset states are kept and restored when you switch it back on.",
			presetGroup: "Enable per preset",
			subagentGroup: "Subagent presets",
			inheritLabel: "Default preset: same as the parent",
			inheritHint: "On: a child inherits the parent's preset at creation. Off: pick a default preset below.",
			defaultLabel: "Default preset",
			defaultHint: "Used when a child is created without agent_preset.",
			allowedLabel: "Presets subagents may use (all on = unrestricted)",
			colGuidance: "Tools/guidance",
			colSubagent: "For subagents",
			packageGroup: "Preset packages",
			packageHint: "Imported presets may only use plugins installed here; a preset needing missing plugins is rejected with the list.",
			exportAction: "Export",
			exportDone: "File exported.",
			importAction: "Import…",
			save: "Save",
			saving: "Saving…",
			saveFailed: "This deployment did not accept these values; they were kept for you to correct.",
			readOnly: "This deployment stores settings read-only.",
			unavailable: "This plugin is not loaded, so it cannot be configured right now.",
			loadingPresets: "Loading presets…",
			noPresets: "No presets to configure",
			itemsSummary: "Manage presets: per-preset tools and guidance, subagent candidates and default, and preset packages.",
			standard: "Standard mode",
			ptc: "PTC mode",
			minimal: "Minimal mode",
			cordis: "Creator mode"
		};

		/** Built-in preset ids whose display names live in this bundle's locale. */
		const BUILTIN_NAMES = { standard: "standard", ptc: "ptc", minimal: "minimal", cordis: "cordis" };

		/** Built-in presets that default to preset-management guidance on (minimal is off). */
		const DEFAULT_GUIDANCE_ON = ["standard", "ptc", "cordis", "better-standard"];

		/** Display name: declaration metadata first, localized built-in fallback second. */
		function displayName(row, t) {
			if (row === void 0) return "";
			if (row.name !== void 0 && row.name !== "") return row.name;
			const key = BUILTIN_NAMES[row.id];
			return key === void 0 ? row.id : t(key);
		}

		function errorText(error) {
			return error instanceof Error ? error.message : String(error);
		}

		// ── component ───────────────────────────────────────────────────────
		/**
		 * Header trigger + preset panel. Standard slot props provide the Session id
		 * and store hooks; this bundle injects `loadRoster` and `switchTo`.
		 */
		function PresetSwitch(props) {
			const { sessionId, useSessions, loadRoster, switchTo, t } = props;
			const presetId = useSessions(function (state) {
				const value = state.byId[sessionId]?.projectionValues?.agentPreset;
				return typeof value === "string" ? value : void 0;
			});
			const [roster, setRoster] = React.useState(function () {
				return loadRoster.cached();
			});
			const [status, setStatus] = React.useState(roster.length > 0 ? "ready" : "idle");
			const [loadError, setLoadError] = React.useState(null);
			const [open, setOpen] = React.useState(false);
			const [switching, setSwitching] = React.useState(null);
			const [switchError, setSwitchError] = React.useState(null);
			const rootRef = React.useRef(null);
			const triggerRef = React.useRef(null);
			const triggerLabelRef = React.useRef(null);
			const panelRef = React.useRef(null);
			const hoverTimer = React.useRef(void 0);
			const pinnedRef = React.useRef(false);
			const position = primitives.useAnchoredPosition({
				open,
				anchorRef: triggerRef,
				panelRef,
				gap: 5,
				margin: 16
			});
			const positioned = position !== null;

			const refresh = React.useCallback(
				async function (force) {
					setStatus(function (current) {
						return current === "loading" ? current : "loading";
					});
					try {
						const presets = await loadRoster(force);
						setRoster(presets);
						setLoadError(null);
						setStatus("ready");
					} catch (error) {
						setStatus("error");
						setLoadError(errorText(error));
					}
				},
				[loadRoster]
			);

			React.useEffect(
				function () {
					if (roster.length === 0) refresh(false);
				},
				[refresh, roster.length]
			);

			React.useEffect(
				function () {
					setOpen(false);
					pinnedRef.current = false;
					setSwitching(null);
					setSwitchError(null);
				},
				[sessionId]
			);

			const cancelHoverChange = function () {
				clearTimeout(hoverTimer.current);
				hoverTimer.current = void 0;
			};
			React.useEffect(function () {
				return cancelHoverChange;
			}, []);

			const changeOpen = function (next) {
				cancelHoverChange();
				if (!next) pinnedRef.current = false;
				setOpen(next);
				if (next) refresh(false);
			};
			primitives.useDismissOnOutsidePointer(rootRef, open, changeOpen, panelRef);

			React.useLayoutEffect(
				function () {
					if (open && positioned && pinnedRef.current) panelRef.current?.focus();
				},
				[open, positioned]
			);

			React.useEffect(
				function () {
					if (!open) return void 0;
					const dismiss = function (event) {
						if (event.key !== "Escape") return;
						event.preventDefault();
						cancelHoverChange();
						pinnedRef.current = false;
						setOpen(false);
						if (panelRef.current !== null && panelRef.current.contains(document.activeElement)) triggerRef.current?.focus();
					};
					document.addEventListener("keydown", dismiss);
					return function () {
						document.removeEventListener("keydown", dismiss);
					};
				},
				[open]
			);

			const scheduleHoverOpen = function () {
				cancelHoverChange();
				if (open) return;
				const label = triggerLabelRef.current;
				if (label === null) return;
				if (getComputedStyle(label).display === "none") return;
				hoverTimer.current = setTimeout(function () {
					hoverTimer.current = void 0;
					changeOpen(true);
				}, 150);
			};
			const scheduleHoverClose = function () {
				cancelHoverChange();
				if (pinnedRef.current) return;
				hoverTimer.current = setTimeout(function () {
					hoverTimer.current = void 0;
					changeOpen(false);
				}, 120);
			};

			if (presetId === void 0) return null;

			const current = roster.find(function (row) {
				return row.id === presetId;
			});
			const label = current === void 0 ? presetId : displayName(current, t);
			const choose = function (row) {
				if (switching !== null || row.broken !== void 0) return;
				setSwitchError(null);
				setSwitching(row.id);
				Promise.resolve()
					.then(function () {
						return switchTo(sessionId, row.id);
					})
					.then(
						function () {
							setSwitching(null);
							pinnedRef.current = false;
							setOpen(false);
						},
						function (error) {
							setSwitching(null);
							setSwitchError(errorText(error));
						}
					);
			};

			const items = roster.map(function (row) {
				const isCurrent = row.id === presetId;
				const broken = row.broken !== void 0;
				const busy = switching === row.id;
				return h(
					"button",
					{
						key: row.id,
						type: "button",
						className: isCurrent ? S.item + " " + S.itemCurrent : S.item,
						disabled: broken || switching !== null,
						onClick: function () {
							choose(row);
						}
					},
					h(
						"span",
						{ className: S.itemName },
						h("span", { className: S.itemNameText }, displayName(row, t)),
						isCurrent ? h(primitives.Tag, { tone: "info", className: S.currentTag }, t("current")) : null
					),
					h("span", { className: S.itemId }, row.id),
					row.description !== void 0 ? h("span", { className: S.itemDesc }, row.description) : null,
					broken ? h("span", { className: S.itemId }, t("broken")) : null,
					busy ? h("span", { className: S.itemId }, t("switching")) : null
				);
			});

			const panel = h(
				"div",
				{
					ref: panelRef,
					className: S.panel,
					style: position !== null ? position : { visibility: "hidden", left: 0, top: 0 },
					role: "dialog",
					tabIndex: -1,
					"aria-label": t("panelTitle"),
					"data-preset-manager-panel": true,
					onMouseEnter: cancelHoverChange,
					onMouseLeave: scheduleHoverClose
				},
				h(
					"div",
					{ className: S.body },
					h(
						"section",
						null,
						h("h3", null, t("panelTitle"), roster.length > 0 ? h("span", { className: S.count }, String(roster.length)) : null),
						items.length > 0
							? h("div", { className: S.list }, items)
							: h(
									"p",
									{ className: S.empty },
									status === "loading" ? t("loading") : status === "error" ? t("unavailable") : t("unavailable")
								)
					),
					loadError !== null
						? h("div", { className: S.error, role: "alert" }, h(primitives.StateDot, { state: "error" }), loadError)
						: null,
					switchError !== null
						? h(
								"div",
								{ className: S.error, role: "alert" },
								h(primitives.StateDot, { state: "error" }),
								t("failed") + switchError
							)
						: null,
					h("p", { className: S.hint }, t("hint"))
				)
			);

			return h(
				"div",
				{ ref: rootRef, className: S.root, "data-preset-manager": true, onMouseLeave: scheduleHoverClose },
				h(
					"button",
					{
						type: "button",
						ref: triggerRef,
						onMouseEnter: scheduleHoverOpen,
						className: S.trigger,
						"aria-label": t("trigger"),
						"aria-haspopup": "dialog",
						"aria-expanded": open,
						onClick: function () {
							cancelHoverChange();
							pinnedRef.current = true;
							if (!open) changeOpen(true);
							else panelRef.current?.focus();
						}
					},
					h(primitives.IconAgentPresetOutlineRegular, { size: 14 }),
					h("span", { className: S.triggerPrefix }, t("triggerPrefix")),
					h("span", { ref: triggerLabelRef, className: S.triggerLabel }, label)
				),
				open ? ReactDOM.createPortal(panel, document.body) : null
			);
		}

		// ── command card (keyed by command name "preset") ───────────────────
		/**
		 * Render the `/preset` command lifecycle with our own card: Chinese title,
		 * a one-line collapsed summary and expandable details (context sentence,
		 * original/new preset with id and English name, optional cache warning).
		 *
		 * Replaces the generic command card through the keyed
		 * `conversation.chat.commandview` slot; the generic card would show the raw
		 * ASCII command name as its title and print the whole result text in the
		 * collapsed row.
		 */
		function PresetCommandCard(props) {
			const { node, t } = props;
			const outcome = node !== null && node !== void 0 && node.outcome !== void 0 ? node.outcome : null;
			const running = outcome === null;
			const error = outcome !== null && outcome.kind === "error";
			const text = outcome !== null && typeof outcome.text === "string" ? outcome.text : "";
			const lines = text.split("\n");
			const first = lines.length > 0 ? lines[0] : "";
			const detailLines = lines.slice(1).filter(function (line) {
				return line !== "";
			});
			const cacheLine = detailLines.find(function (line) {
				return line.indexOf("缓存：") === 0;
			});
			const bodyLines = detailLines.filter(function (line) {
				return line.indexOf("缓存：") !== 0;
			});
			const expandable = bodyLines.length > 0 || cacheLine !== void 0;
			const [open, setOpen] = React.useState(false);
			const active = open && expandable;
			const summary = running
				? t("running")
				: first.indexOf("切换预设：") === 0
					? first.slice("切换预设：".length)
					: first;
			const toggle = React.useCallback(function () {
				setOpen(function (value) {
					return !value;
				});
			}, []);

			const collapsed = h(
				React.Fragment,
				null,
				h("span", { className: S.cmdSep, "data-shimmer-decoration": true, "aria-hidden": true }),
				h("span", { className: S.cmdSummary, "data-error": error ? true : void 0 }, summary),
				cacheLine !== void 0 ? h("span", { className: S.cmdWarnDot, title: cacheLine }, "⚠") : null
			);

			const body = active
				? h(
						"div",
						{ className: S.cmdBody },
						bodyLines.map(function (line, index) {
							const colon = line.indexOf("：");
							if (colon > 0 && colon <= 8) {
								return h(
									"p",
									{ key: index, className: S.cmdRow },
									h("span", { className: S.cmdLabel }, line.slice(0, colon + 1)),
									h("span", { className: S.cmdValue }, line.slice(colon + 1).trim())
								);
							}
							return h("p", { key: index, className: S.cmdText }, line);
						}),
						cacheLine !== void 0
							? h("p", { className: S.cmdWarn }, h("span", null, "⚠"), h("span", null, cacheLine.slice("缓存：".length)))
							: null
					)
				: null;

			return h(
				"div",
				{ className: S.cmdRoot, "data-preset-command": true },
				h(primitives.DisclosureRow, {
					titleClassName: S.cmdTitle,
					icon: h(primitives.IconAgentPresetOutlineRegular, { size: 14 }),
					title: t("cardTitle"),
					running,
					open: active,
					expandable,
					expandOnRowClick: true,
					keepContentWhenOpen: true,
					onToggle: toggle,
					collapsedContent: collapsed,
					children: body
				})
			);
		}

		/** 内置 Menu 的预设选择：锚点按钮 + 下拉菜单，样式贴近内置预设选择。 */
		function PresetMenu(props) {
			const { t, roster, value, onChoose, disabled } = props;
			const [open, setOpen] = React.useState(false);
			const items = (roster ?? []).map(function (item) {
				return { id: item.id, label: displayName(item, t) };
			});
			const selected = (roster ?? []).find(function (item) {
				return item.id === value;
			});
			const label = selected === void 0 ? value : displayName(selected, t);
			return h(primitives.Menu, {
				open: open && items.length > 0,
				onClose: function () {
					setOpen(false);
				},
				items: items,
				selectedId: value,
				onSelect: function (id) {
					setOpen(false);
					onChoose(id);
				},
				align: "start",
				portal: true,
				anchor: h(
					"button",
					{
						type: "button",
						className: S.menuAnchor,
						disabled: disabled || items.length === 0,
						"aria-haspopup": "menu",
						"aria-expanded": open && items.length > 0,
						onClick: function () {
							setOpen(function (value) {
								return !value;
							});
						}
					},
					h("span", { className: S.menuLabel }, label === "" ? t("defaultLabel") : label),
					h(primitives.IconChevronDownOutlineRegular, { size: 12, className: S.menuChevron })
				)
			});
		}

		// ── settings section (per-preset guidance / tool switches) ──────────
		/**
		 * Settings → 预设管理，和内置配置面板同款：`primitives.SettingsForm`
		 * （暂存式表单 + 保存按钮）包住若干 `primitives.Switch` 行。
		 *
		 * 开关改动只落在本地草稿里（点击立即反馈），点「保存」才通过
		 * ConfigFormController 写回宿主；保存失败时表单保留草稿并显示提示。
		 * 宿主在总开关关闭时忽略逐预设设置，所以重新打开即还原。
		 */
		function PresetSettingsSection(props) {
			const { t, usePresetSwitchConfig, loadRoster, saveSettings, exportPreset, importPreset } = props;
			const snapshot = usePresetSwitchConfig(function (state) {
				return state;
			});
			const [roster, setRoster] = React.useState(null);
			const [draft, setDraft] = React.useState(null);
			const [saving, setSaving] = React.useState(false);
			const [failed, setFailed] = React.useState(false);
			const [saveError, setSaveError] = React.useState(null);
			const [packageBusy, setPackageBusy] = React.useState(false);
			const [packageMessage, setPackageMessage] = React.useState(null);
			const [exportId, setExportId] = React.useState("");
			const fileRef = React.useRef(null);
			React.useEffect(
				function () {
					let cancelled = false;
					Promise.resolve()
						.then(function () {
							return loadRoster(false);
						})
						.then(
							function (presets) {
								if (!cancelled) setRoster(presets);
							},
							function () {
								if (!cancelled) setRoster([]);
							}
						);
					return function () {
						cancelled = true;
					};
				},
				[loadRoster]
			);
			const value = snapshot.value ?? {};
			const base = {
				master: value.guidanceMaster !== false,
				entries: Array.isArray(value.guidancePresets) ? value.guidancePresets : [],
				inherit: value.subagentInherit !== false,
				defaultId: typeof value.subagentDefault === "string" ? value.subagentDefault : "",
				allowed: Array.isArray(value.subagentAllowed) ? value.subagentAllowed : []
			};
			const current = draft === null ? base : draft;
			const dirty = draft !== null;
			const writable = snapshot.status === "ready" && snapshot.writable === true;
			const rosterIds = (roster ?? []).map(function (item) {
				return item.id;
			});
			const guidanceOn = function (id) {
				const entry = current.entries.find(function (item) {
					return item !== null && typeof item === "object" && item.id === id;
				});
				if (entry !== void 0 && typeof entry.enabled === "boolean") return entry.enabled;
				return DEFAULT_GUIDANCE_ON.indexOf(id) >= 0;
			};
			const allowedOn = function (id) {
				if (current.allowed.length === 0) return true;
				return current.allowed.indexOf(id) >= 0;
			};
			const allowedIds = rosterIds.length === 0 ? current.allowed : rosterIds.filter(allowedOn);
			const optionIds = allowedIds.length === 0 ? rosterIds : allowedIds;
			const defaultId = current.defaultId !== "" && optionIds.indexOf(current.defaultId) >= 0 ? current.defaultId : optionIds.length === 0 ? "" : optionIds[0];
			const edit = function (patch) {
				setFailed(false);
				setDraft(Object.assign({}, current, patch));
			};
			const toggleMaster = function () {
				edit({ master: !current.master });
			};
			const toggleGuidance = function (id) {
				const next = current.entries.filter(function (item) {
					return item === null || typeof item !== "object" || item.id !== id;
				});
				next.push({ id: id, enabled: !guidanceOn(id) });
				edit({ entries: next });
			};
			const toggleInherit = function () {
				const inherit = !current.inherit;
				const patch = { inherit: inherit };
				if (!inherit && current.defaultId === "" && optionIds.length > 0) patch.defaultId = optionIds[0];
				edit(patch);
			};
			const toggleAllowed = function (id) {
				const now = allowedOn(id);
				const next = rosterIds.filter(function (candidate) {
					return candidate === id ? !now : allowedOn(candidate);
				});
				if (next.length === 0) return;
				const patch = { allowed: next };
				if (current.defaultId !== "" && next.indexOf(current.defaultId) < 0) patch.defaultId = next[0];
				if (current.defaultId === "" && next.length > 0) patch.defaultId = next[0];
				edit(patch);
			};
			const chooseDefault = function (event) {
				edit({ defaultId: event.target.value });
			};
			const currentExportId = rosterIds.length === 0 ? "" : rosterIds.indexOf(exportId) >= 0 ? exportId : rosterIds[0];
			const download = function (name, text) {
				const blob = new Blob([text], { type: "application/json" });
				const url = URL.createObjectURL(blob);
				const anchor = document.createElement("a");
				anchor.href = url;
				anchor.download = name;
				anchor.click();
				setTimeout(function () {
					URL.revokeObjectURL(url);
				}, 1000);
			};
			const handleExport = function () {
				if (packageBusy || currentExportId === "") return;
				setPackageBusy(true);
				setPackageMessage(null);
				Promise.resolve()
					.then(function () {
						return exportPreset(currentExportId);
					})
					.then(
						function (text) {
							download("preset-" + currentExportId + ".json", text);
							setPackageMessage(t("exportDone"));
							setPackageBusy(false);
						},
						function (reason) {
							setPackageMessage(errorText(reason));
							setPackageBusy(false);
						}
					);
			};
			const handleFile = function (event) {
				const input = event.target;
				const file = input.files !== null && input.files.length > 0 ? input.files[0] : undefined;
				input.value = "";
				if (file === void 0) return;
				setPackageBusy(true);
				setPackageMessage(null);
				Promise.resolve()
					.then(function () {
						return file.text();
					})
					.then(function (text) {
						const bytes = new TextEncoder().encode(text);
						let binary = "";
						for (const byte of bytes) binary += String.fromCharCode(byte);
						return importPreset(btoa(binary));
					})
					.then(
						function (message) {
							setPackageMessage(message);
							setPackageBusy(false);
							return loadRoster(true);
						},
						function (reason) {
							setPackageMessage(errorText(reason));
							setPackageBusy(false);
						}
					);
			};
			const onSave = function () {
				if (!dirty || saving) return;
				setSaving(true);
				setFailed(false);
				setSaveError(null);
				Promise.resolve()
					.then(function () {
						return saveSettings({
							guidanceMaster: current.master,
							guidancePresets: current.entries,
							subagentInherit: current.inherit,
							subagentDefault: current.inherit ? "" : defaultId,
							subagentAllowed: current.allowed
						});
					})
					.then(
						function (accepted) {
							setSaving(false);
							if (accepted) setDraft(null);
							else setFailed(true);
						},
						function (reason) {
							setSaving(false);
							setFailed(true);
							setSaveError(errorText(reason));
						}
					);
			};
			const state = {
				available: snapshot.status === "ready",
				writable: writable,
				dirty: dirty,
				invalid: false,
				saving: saving,
				failed: failed
			};
			const row = function (key, title, hint, checked, onToggle) {
				return h(
					"div",
					{ key: key, className: S.row },
					h("div", { className: S.rowMain }, h("span", null, title), hint === void 0 ? null : h("p", { className: S.rowHint }, hint)),
					h(primitives.Switch, { checked: checked, label: title, disabled: !writable || saving, onChange: onToggle })
				);
			};
			const combinedRow = function (item) {
				return h(
					"div",
					{ key: item.id, className: S.gridRow },
					h("div", { className: S.rowMain }, h("span", null, displayName(item, t)), h("p", { className: S.rowHint }, item.id)),
					h(primitives.Switch, {
						checked: guidanceOn(item.id),
						label: t("colGuidance") + " " + displayName(item, t),
						disabled: !writable || saving,
						onChange: function () {
							toggleGuidance(item.id);
						}
					}),
					h(primitives.Switch, {
						checked: allowedOn(item.id),
						label: t("colSubagent") + " " + displayName(item, t),
						disabled: !writable || saving,
						onChange: function () {
							toggleAllowed(item.id);
						}
					})
				);
			};
			const children = [h("h2", { key: "heading", className: S.heading }, t("nav")), h("p", { key: "intro", className: S.intro }, t("settingsIntro")), row("master", t("masterLabel"), t("masterHint"), current.master, toggleMaster)];
			if (roster === null) {
				children.push(h("p", { key: "loading", className: S.intro }, t("loadingPresets")));
			} else if (roster.length === 0) {
				children.push(h("p", { key: "empty", className: S.intro }, t("noPresets")));
			} else {
				children.push(
					h(
						"div",
						{ key: "header", className: S.gridRow },
						h("span", { className: S.group }, t("presetGroup")),
						h("span", { className: S.colLabel }, t("colGuidance")),
						h("span", { className: S.colLabel }, t("colSubagent"))
					)
				);
				children.push(h("div", { key: "preset-list", className: S.presetList }, roster.map(combinedRow)));
			}
			children.push(h("p", { key: "subagent-group", className: S.group }, t("subagentGroup")));
			children.push(row("subagent-inherit", t("inheritLabel"), t("inheritHint"), current.inherit, toggleInherit));
			if (!current.inherit) {
				const allowedRoster = (roster ?? []).filter(function (item) {
					return optionIds.indexOf(item.id) >= 0;
				});
				children.push(
					h(
						"div",
						{ key: "subagent-default", className: S.row },
						h("div", { className: S.rowMain }, h("span", null, t("defaultLabel")), h("p", { className: S.rowHint }, t("defaultHint"))),
						h(PresetMenu, {
							t: t,
							roster: allowedRoster,
							value: defaultId,
							onChoose: function (id) {
								edit({ defaultId: id });
							},
							disabled: !writable || saving
						})
					)
				);
			}
			children.push(
				h(
					"div",
					{ key: "package", className: S.row },
					h("div", { className: S.rowMain }, h("span", null, t("packageGroup")), h("p", { className: S.rowHint }, t("packageHint"))),
					h(
						"div",
						{ className: S.rowEnd },
						h(PresetMenu, {
							t: t,
							roster: roster ?? [],
							value: currentExportId,
							onChoose: setExportId,
							disabled: packageBusy || rosterIds.length === 0
						}),
						h(primitives.Button, { size: "sm", variant: "outline", disabled: packageBusy || currentExportId === "", onClick: handleExport }, t("exportAction")),
						h(primitives.Button, { size: "sm", variant: "outline", disabled: packageBusy, onClick: function () { if (fileRef.current !== null) fileRef.current.click(); } }, t("importAction")),
						h("input", { ref: fileRef, type: "file", accept: "application/json,.json", style: { display: "none" }, onChange: handleFile })
					)
				)
			);
			if (packageMessage !== null) children.push(h("p", { key: "package-message", className: S.intro }, packageMessage));
			if (saveError !== null) children.push(h("p", { key: "error", className: S.error }, saveError));
			return h(
				primitives.SettingsForm,
				{
					labels: {
						unavailable: t("unavailable"),
						readOnly: t("readOnly"),
						saveFailed: t("saveFailed"),
						save: t("save"),
						saving: t("saving")
					},
					state: state,
					onSave: onSave,
					onDiscard: function () {
						if (dirty) {
							setDraft(null);
							setFailed(false);
						}
					}
				},
				h("div", { className: S.formBody }, children)
			);
		}
		// ── plugins page card (same form, where built-in config panels live) ──
		/** 插件页「预设管理器」卡片：概要一行，页面复用设置页的同一份表单。 */
		function PresetItemsPage(props) {
			if (props.view === "summary") return props.t("itemsSummary");
			return h(PresetSettingsSection, props);
		}

		/** 把设置面板的渲染异常挡在本地，避免整块设置界面被卸载。 */
		class PresetSectionBoundary extends React.Component {
			constructor(props) {
				super(props);
				this.state = { error: null };
			}
			static getDerivedStateFromError(error) {
				return { error };
			}
			render() {
				if (this.state.error !== null) {
					const message = this.state.error !== null && this.state.error !== void 0 && this.state.error.message !== void 0 ? this.state.error.message : String(this.state.error);
					return h("pre", { className: S.boundary }, "预设管理渲染失败：" + message);
				}
				return this.props.children;
			}
		}

		function PresetSettingsSectionSafe(props) {
			return h(PresetSectionBoundary, null, h(PresetSettingsSection, props));
		}

		function PresetItemsPageSafe(props) {
			return h(PresetSectionBoundary, null, h(PresetItemsPage, props));
		}

		// ── mount ───────────────────────────────────────────────────────────
		const CACHE_TTL_MS = 30000;

		/** Required browser services: slot, session store, locale, remotes, settings forms. */
		const inject = ["slots", "sessions", "locale", "configForms", "remote", "remote.agentPresets", "remote.settings", "remote.commands"];

		function apply(ctx) {
			const cache = { at: 0, presets: null };
			const loadRoster = async function (force) {
				if (!force && cache.presets !== null && Date.now() - cache.at < CACHE_TTL_MS) return cache.presets;
				const result = await ctx.remote.agentPresets.list();
				if (!result.ok) {
					const error = result.error ?? {};
					throw new Error(error.message ?? error.code ?? "agentPresets.list failed");
				}
				const presets = result.value !== undefined && Array.isArray(result.value.presets) ? result.value.presets : [];
				cache.at = Date.now();
				cache.presets = presets;
				return presets;
			};
			loadRoster.cached = function () {
				return cache.presets ?? [];
			};
			const switchTo = async function (sessionId, id) {
				const result = await ctx.remote.commands.execute(sessionId, "/preset " + id, []);
				if (!result.ok) {
					const error = result.error ?? {};
					throw new Error(error.message ?? error.code ?? "command refused");
				}
				if (result.value === void 0) throw new Error("unknown command: /preset " + id);
				const outcome = result.value.result;
				if (outcome === void 0 || outcome.kind !== "success") {
					throw new Error(outcome !== undefined && outcome.text !== void 0 ? outcome.text : "preset switch was rejected");
				}
				return outcome.text;
			};

			ctx.effect(function () {
				return ctx.locale.register(NS, { zh, en });
			}, "preset-manager-ui: dictionaries");

			// 预设包：通过命令通道让宿主读写（设置页里没有会话上下文，取主视图会话）。
			const activeSessionId = function () {
				try {
					const snapshot = ctx.sessions.list.getSnapshot();
					const byId = snapshot.byId ?? {};
					const list = Object.values(byId);
					const active = list.find(function (session) {
						return session.blank === false && ((session.retainedBy && session.retainedBy.mainView) || 0) > 0;
					});
					const chosen = active ?? list.find(function (session) {
						return session.blank === false;
					}) ?? list[0];
					return chosen === void 0 ? void 0 : chosen.id;
				} catch {
					return void 0;
				}
			};
			const runCommand = async function (line) {
				const sessionId = activeSessionId();
				if (sessionId === void 0) throw new Error("没有可用的会话，无法执行预设包命令");
				const response = await ctx.remote.commands.execute(sessionId, line, []);
				if (!response.ok) {
					const failure = response.error ?? {};
					throw new Error(failure.message ?? failure.code ?? "command refused");
				}
				const outcome = response.value === void 0 ? void 0 : response.value.result;
				if (outcome === void 0 || outcome.kind !== "success") {
					throw new Error(outcome !== void 0 && outcome.text !== void 0 ? outcome.text : "命令执行失败");
				}
				return outcome.text;
			};
			const exportPreset = function (id) {
				return runCommand("/preset-export " + id);
			};
			const importPreset = function (base64) {
				return runCommand("/preset-import " + base64);
			};

			// Warm the roster before the first hover so the trigger reads its name.
			Promise.resolve()
				.then(function () {
					return loadRoster(false);
				})
				.catch(function () {});

			ctx.slots.inject("conversation.session.header.actions", function () {
				return ctx.slots.register(
					{
						name: "conversation.session.header.actions",
						id: "preset-manager",
						order: -10,
						locale: NS,
						inject: function () {
							return { loadRoster, switchTo };
						}
					},
					PresetSwitch
				);
			});

			// Keyed by command name: render our own card for `/preset` instead of the
			// generic command card (Chinese title + short collapsed summary + details).
			// priority: -1 —— 若同一页面里还残留旧版插件（相同 key 的注册），新注册
			// 会以更低优先级“遮住”它，而不是让整个插件同步失败；正常安装时就是唯一项。
			ctx.slots.inject("conversation.chat.commandview", function () {
				try {
					return ctx.slots.register(
						{
							name: "conversation.chat.commandview",
							key: "preset",
							priority: -1,
							locale: NS
						},
						PresetCommandCard
					);
				} catch (error) {
					console.warn("[preset-manager] commandview slot conflict, keeping the other registration:", error);
					return function () {};
				}
			});

			// Settings → 预设管理：总开关 + 逐预设开关（写回 `preset-manager`
			// 插件的 volatile 配置；宿主按同一份配置决定是否注入工具与引导）。
			let presetConfigForm;
			try {
				presetConfigForm = ctx.configForms.get("preset-manager");
			} catch {
				presetConfigForm = void 0;
			}
			if (presetConfigForm !== void 0) {
				// 直接走 settings.mutate：这样失败时能拿到宿主返回的错误码/文本，
				// 显示在表单下方，便于定位（成功时宿主会推 document-updated，
				// 共享 mirror 会重新读取）。
				const saveSettings = async function (values) {
					const snapshot = presetConfigForm.getSnapshot();
					const revision = snapshot.status === "ready" ? snapshot.revision : void 0;
					const result = await ctx.remote.settings.mutate(
						"preset-manager",
						[
							{ op: "set", path: ["guidanceMaster"], value: values.guidanceMaster },
							{ op: "set", path: ["guidancePresets"], value: values.guidancePresets },
							{ op: "set", path: ["subagentInherit"], value: values.subagentInherit },
							{ op: "set", path: ["subagentDefault"], value: values.subagentDefault },
							{ op: "set", path: ["subagentAllowed"], value: values.subagentAllowed }
						],
						revision
					);
					if (!result.ok) {
						const failure = result.error ?? {};
						throw new Error((failure.code === void 0 ? "" : failure.code + ": ") + (failure.message ?? "settings.mutate failed"));
					}
					return true;
				};
				ctx.slots.inject("settings.section", function () {
					return ctx.slots.register(
						{
							name: "settings.section",
							id: "preset-manager",
							order: 30,
							label: function () {
								return ctx.locale.bind(NS)("nav");
							},
							locale: NS,
							inject: function () {
								return {
									hooks: { presetSwitchConfig: presetConfigForm },
									loadRoster,
									saveSettings,
									exportPreset,
									importPreset
								};
							}
						},
						PresetSettingsSectionSafe
					);
				});
				// 插件页（内置插件 → 基础能力）也放一张卡片，和内置配置面板同位置、
				// 同一份表单；summary 只显示一行说明。
				ctx.slots.inject("plugins.item", function () {
					return ctx.slots.register(
						{
							name: "plugins.item",
							id: "preset-manager",
							order: 60,
							label: function () {
								return ctx.locale.bind(NS)("pluginName");
							},
							locale: NS,
							inject: function () {
								return {
									hooks: { presetSwitchConfig: presetConfigForm },
									loadRoster,
									saveSettings,
									exportPreset,
									importPreset
								};
							}
						},
						PresetItemsPageSafe
					);
				});
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
