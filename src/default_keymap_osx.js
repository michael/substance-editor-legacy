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
    "alt+up", "alt+down", "alt+left", "alt+right",
    "alt+shift+up", "alt+shift+down", "alt+shift+left", "alt+shift+right",
    "command+up", "command+down", "command+left", "command+right",
    "command+shift+up", "command+shift+down", "command+shift+left", "command+shift+right"
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
  "undo": ["command+z"],
  "redo": ["command+shift+z"],

  "copy": ["command+c"],
  "paste": ["command+v"],

  // Annotations
  // --------

  "strong": ["ctrl+b"],
  "emphasis": ["ctrl+i"],

  // Content
  // --------
  "heading": ["ctrl+command+h"],
  "figref": ["ctrl+command+f"],
};

module.exports = keymap;
