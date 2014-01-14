var Commander = require("substance-commander");

// TODO: make this configurable.
var SurfaceKeyboard = function(editor) {
  var keyboard = new Commander.Mousetrap();

  // Connects this keyboard to a Surface
  // --------
  // Note: the argument `surface` is a Surface.Editing instance

  this.connect = function(surface) {
    keyboard.bind([
        "up", "down", "left", "right",
        "shift+up", "shift+down", "shift+left", "shift+right",
        "ctrl+up", "ctrl+down", "ctrl+left", "ctrl+right",
        "ctrl+shift+up", "ctrl+shift+down", "ctrl+shift+left", "ctrl+shift+right",
        "alt+up", "alt+down", "alt+left", "alt+right",
        "alt+shift+up", "alt+shift+down", "alt+shift+left", "alt+shift+right",
        "command+up", "command+down", "command+left", "command+right"
    ], function() {
      surface.onCursorMoved();
    }, "keydown");

    // Note: these stupid 'surface.manipulate' stuff is currently necessary
    // as I could not find another way to distinguish the cases for regular text input
    // and multi-char input. It would not be necessary, if we had a robust way
    // to recognize native key events for that complex chars...
    // However, for now that dirt... we can this streamline in future - for sure...

    keyboard.bind(["backspace"], surface.manipulate(function() {
      editor.delete("left");
    }), "keydown");

    keyboard.bind(["del"], surface.manipulate(function() {
      editor.delete("right");
    }), "keydown");

    keyboard.bind(["enter"], surface.manipulate(function() {
      editor.breakNode();
    }), "keydown");

    keyboard.bind(["shift+enter"], surface.manipulate(function() {
      editor.write("\n");
    }), "keydown");

    keyboard.bind(["space", "shift+space"], surface.manipulate(function() {
      editor.write(" ");
    }), "keydown");

    keyboard.bind(["tab"], surface.manipulate(function() {
      editor.indent("right");
    }), "keydown");

    keyboard.bind(["shift+tab"], surface.manipulate(function() {
      editor.indent("left");
    }), "keydown");

    keyboard.bind(["ctrl+z"], surface.manipulate(function() {
      editor.undo();
    }), "keydown");

    keyboard.bind(["ctrl+shift+z"], surface.manipulate(function() {
      editor.redo();
    }), "keydown");

    keyboard.bind(["ctrl+b"], surface.manipulate(function() {
      editor.annotate("strong");
    }), "keydown");

    keyboard.bind(["ctrl+i"], surface.manipulate(function() {
      editor.annotate("emphasis");
    }), "keydown");

    keyboard.bind(["ctrl+c"], surface.manipulate(function() {
      editor.copy();
    }), "keydown");

    keyboard.bind(["ctrl+v"], surface.manipulate(function() {
      editor.paste();
    }), "keydown");

    // EXPERIMENTAL hooks for creating new node and annotation types

    keyboard.bind(["ctrl+shift+c"], surface.manipulate(function() {
      editor.annotate("issue");
    }), "keydown");

    keyboard.bind(["ctrl+shift+m"], surface.manipulate(function() {
      editor.annotate("math");
    }), "keydown");

    keyboard.bind(["ctrl+t"], surface.manipulate(function() {
      editor.changeType("text");
    }), "keydown");

    keyboard.bind(["ctrl+h"], surface.manipulate(function() {
      editor.insertNode("heading", {"level": 1});
    }), "keydown");

    keyboard.connect(surface.el);
  };

  this.disconnect = function() {
    keyboard.disconnect();
  };
};

module.exports = SurfaceKeyboard;
