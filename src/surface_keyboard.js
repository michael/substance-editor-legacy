var Commander = require("substance-commander");

// TODO: make this configurable.
var SurfaceKeyboard = function(editor, keymap) {
  var keyboard = new Commander.Mousetrap();

  this.keymap = keymap;

  // Connects this keyboard to a Surface
  // --------
  // Note: the argument `surface` is a Surface.Editing instance

  this.connect = function(surface) {

    keyboard.bind(keymap["selection"], function() {
      surface.onCursorMoved();
    }, "keydown");

    // Note: these stupid 'surface.manipulate' stuff is currently necessary
    // as I could not find another way to distinguish the cases for regular text input
    // and multi-char input. It would not be necessary, if we had a robust way
    // to recognize native key events for that complex chars...
    // However, for now that dirt... we can this streamline in future - for sure...

    keyboard.bind(keymap["backspace"], surface.manipulate(function() {
      editor.delete("left");
    }), "keydown");

    keyboard.bind(keymap["delete"], surface.manipulate(function() {
      editor.delete("right");
    }), "keydown");

    keyboard.bind(keymap["break"], surface.manipulate(function() {
      editor.breakNode();
    }), "keydown");

    keyboard.bind(keymap["soft-break"], surface.manipulate(function() {
      editor.write("\n");
    }), "keydown");

    keyboard.bind(keymap["blank"], surface.manipulate(function() {
      editor.write(" ");
    }), "keydown");

    keyboard.bind(keymap["indent"], surface.manipulate(function() {
      editor.indent("right");
    }), "keydown");

    keyboard.bind(keymap["unindent"], surface.manipulate(function() {
      editor.indent("left");
    }), "keydown");

    keyboard.bind(keymap["undo"], surface.manipulate(function() {
      editor.undo();
    }), "keydown");

    keyboard.bind(keymap["redo"], surface.manipulate(function() {
      editor.redo();
    }), "keydown");

    keyboard.bind(keymap["strong"], surface.manipulate(function() {
      editor.annotate("strong");
    }), "keydown");

    keyboard.bind(keymap["emphasis"], surface.manipulate(function() {
      editor.annotate("emphasis");
    }), "keydown");

    // EXPERIMENTAL hooks for creating new node and annotation types

    keyboard.bind(keymap["heading"], surface.manipulate(function() {
      editor.insertNode("heading", {"level": 1});
    }), "keydown");

    keyboard.connect(surface.el);
  };

  this.disconnect = function() {
    keyboard.disconnect();
  };

  this.bind = function(cmd, handler, eType) {
    keyboard.bind(keymap[cmd], handler, eType);
  };
};

module.exports = SurfaceKeyboard;
