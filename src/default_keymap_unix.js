var keymap = {

  // Navigation
  // --------
  // add everything what changes the selection or the cursor
  //

  "selection": [
    "up", "down", "left", "right",
    "shift+up", "shift+down", "shift+left", "shift+right",
    "ctrl+up", "ctrl+down", "ctrl+left", "ctrl+right",
    "ctrl+shift+up", "ctrl+shift+down", "ctrl+shift+left", "ctrl+shift+right",
  ],

  // Editing
  // --------

  "backspace": ["backspace"],
  "delete": ["del"],
  "break": ["enter"],
  "soft-break": ["shift+enter"],

  // HACK: we have to overload the native whitespace input as it triggers
  // a scroll under MacOSX
  "blank": ["space", "shift+space"],

  "indent": ["tab"],
  "unindent": ["shift+tab"],
  "undo": ["ctrl+z"],
  "redo": ["ctrl+shift+z"],

  "copy": ["ctrl+c"],
  "paste": ["ctrl+v"],

  // Annotations
  // --------

  "strong": ["ctrl+b"],
  "emphasis": ["ctrl+i"],

  // Content
  // --------
  "heading": ["ctrl+alt+h"]
};

module.exports = keymap;
