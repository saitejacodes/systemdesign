import type { BeforeMount } from "@monaco-editor/react";

/** vs-dark with comments lifted from #608B4E (4.2:1) to reach 4.5:1 on its #1E1E1E background. */
export const DARK_THEME = "sdl-dark";
export const defineThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme(DARK_THEME, { base: "vs-dark", inherit: true, rules: [{ token: "comment", foreground: "8FBF7A" }], colors: {} });
};
