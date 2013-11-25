"use strict";

var Commander = require("substance-commander");

// A simple Richtext Editor
// ========
//
// This editor is tailored to a very simple use-case: documents that consist only
// of Text, Headings, and Lists.

var RichTextEditor = function(docCtrl, view) {
  // this.docCtrl = docCtrl;
  // this.view = view;

  // this.container = document.get(this.view);
  // this.selection = new Selection(this.container);
  // this.clipboard = new Clipboard();
};

RichTextEditor.Prototype = function() {

  // Delete current selection
  // --------
  //

  this.delete = function(direction) {
    console.log("I am sorry. Currently disabled.");
  };

  // Copy the current selection
  // --------
  //

  this.copy = function() {
    console.log("I am sorry. Currently disabled.");
  };

  // Cut current selection from document
  // --------
  //
  // Returns cutted content as a new Substance.Document

  this.cut = function() {
    console.log("I am sorry. Currently disabled.");
  };

  // Paste content from clipboard at current position
  // --------
  //

  this.paste = function() {
    console.log("I am sorry. Currently disabled.");
  };

  // Insert a break at the current position
  // --------
  // executed when pressing RETURN within a node.

  this.break = function() {
    console.log("I am sorry. Currently disabled.");
  };

  // Create an annotation of given type for the current selection
  // --------
  //

  this.annotate = function(type) {
    console.log("I am sorry. Currently disabled.");
  };

  // Insert text at the current position
  // --------
  //

  this.write = function(text) {
    console.log("I am sorry. Currently disabled.");
  };
};

RichTextEditor.prototype = new RichTextEditor.Prototype();

RichTextEditor.Keyboard = function(docCtrl) {

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
        "alt+up", "alt+down", "alt+left", "alt+right"
    ], function() {
      surface.onCursorMoved();
    }, "keydown");

    keyboard.bind(["backspace"], surface.manipulate(function() {
      docCtrl.delete("left");
    }), "keydown");

    keyboard.bind(["del"], surface.manipulate(function() {
      docCtrl.delete("right");
    }), "keydown");

    keyboard.bind(["enter"], surface.manipulate(function() {
      docCtrl.breakNode();
    }), "keydown");

    keyboard.bind(["shift+enter"], surface.manipulate(function() {
      docCtrl.write("\n");
    }), "keydown");

    keyboard.bind(["space"], surface.manipulate(function() {
      docCtrl.write(" ");
    }), "keydown");

    keyboard.bind(["tab"], surface.manipulate(function() {
      docCtrl.write("  ");
    }), "keydown");

    keyboard.bind(["ctrl+z"], surface.manipulate(function() {
      docCtrl.undo();
    }), "keydown");

    keyboard.bind(["ctrl+shift+z"], surface.manipulate(function() {
      docCtrl.redo();
    }), "keydown");

    // EXPERIMENTAL hooks for creating new node and annotation types

    keyboard.bind(["ctrl+shift+c"], surface.manipulate(function() {
      docCtrl.annotate("issue");
    }), "keydown");

    keyboard.bind(["ctrl+shift+m"], surface.manipulate(function() {
      docCtrl.annotate("math");
    }), "keydown");

    keyboard.bind(["ctrl+shift+h"], surface.manipulate(function() {
      docCtrl.annotate("math");
    }), "keydown");

    keyboard.connect(surface.el);
  };

  this.disconnect = function() {
    keyboard.disconnect();
  };
};

module.exports = RichTextEditor;
