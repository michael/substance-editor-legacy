"use strict";

var Commander = require("substance-commander");
var DocumentController = require("substance-document").Controller;

// A simple Richtext Editor
// ========
//
// This editor is tailored to a very simple use-case: documents that consist only
// of Text, Headings, and Lists.

var RichTextEditor = function(document, editorFactory, options) {
  options = options || {};
  DocumentController.call(this, document, options);
  this.document = document;

  this.editorFactory = editorFactory;
  this.editors = {};
};

RichTextEditor.Prototype = function() {

  var __super__ = DocumentController.prototype;

  // Delete current selection
  // --------
  //

  this.delete = function(direction) {
    var session = this.startManipulation();
    // var doc = session.doc;
    var sel = session.sel;

    if (sel.isNull()) return;

    if (sel.isCollapsed()) {
      sel.expand(direction, "char");
    }

    if (this.__deleteSelection(session)) {
      session.save();
      this.selection.set(sel);
    }
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

  this.breakNode = function() {
    if (this.selection.isNull()) {
      console.error("Can not break, as no position has been selected.");
      return;
    }
    var session = this.startManipulation();
    var sel = session.sel;

    var node = sel.getNodes()[0];
    var cursorPos = sel.range().start;
    var nodePos = cursorPos[0];
    var charPos = cursorPos[1];

    // Get the editor and ask for permission to break the node at the given position
    var editor = this.getEditor(node);
    if (!editor.canBreak(node, charPos)) {
      console.log("Can not break at the given position.");
      return;
    }

    // if the selection is expanded then delete first
    // Note: this.__deleteSelection collapses the session cursor.
    if (!sel.isCollapsed()) {
      if (!this.__deleteSelection(session)) {
        console.log("Could not delete the selected content");
        return;
      }
    }

    // Let the editor apply operations to break the node
    if (editor.breakNode(session, node, nodePos, charPos)) {
      session.save();
      // update the cursor
      var newCursorPos = [nodePos+1, 0];
      this.selection.set(newCursorPos);
    }
  };

  // Create an annotation of given type for the current selection
  // --------
  //

  this.annotate = function(type) {
    var session = this.startManipulation();
    var newCursorPos = session.sel.range().start;
    session.annotator.annotate(session.sel, type);
    session.save();
    // Note: it feels better when the selection is collapsed after setting the
    // annotation style
    session.sel.collapse("right");
    this.selection.set(session.sel);
  };

  // Insert text at the current position
  // --------
  // Note: currently only works for text nodes.
  // TODO: we need support for textish properties, too.

  this.write = function(text) {
    if (this.selection.isNull()) {
      console.error("Can not write, as no position has been selected.");
      return;
    }

    var session = this.startManipulation();
    var doc = session.doc;
    var sel = session.sel;

    var node = sel.getNodes()[0];
    var cursorPos = sel.range().start;
    var nodePos = cursorPos[0];
    var charPos = cursorPos[1];

    // Get the editor and ask for permission to insert text at the given position
    var editor = this.getEditor(node);
    if (!editor.canInsert(node, charPos)) {
      console.log("Can not insert at the given position.");
      return;
    }

    // if the selection is expanded then delete first
    // Note: this.__deleteSelection collapses the session cursor.
    if (!sel.isCollapsed()) {
      if (!this.__deleteSelection(session)) {
        console.log("Could not delete the selected content");
        return;
      }
    }

    // Ask for an operation and abort if no operation is given.
    var op = editor.insertOperation(node, charPos, text);
    if (!op) {
      return;
    }

    // Apply the operation and save the session
    doc.apply(op);
    session.save();

    // update the cursor
    this.selection.set([nodePos, charPos + text.length]);
  };

  this.__deleteSelection = function(session) {
    var sel = session.sel;
    var nodes = sel.getNodes();

    var success;
    if (nodes.length === 1) {
      success = this.__deleteSingle(session, nodes[0]);
    } else {
      console.error("Sorry, deletion for multi-node selections is not yet implemented.");
      return false;
    }

    // in any case after deleting the cursor shall be
    // at the left bound of the selection
    sel.set(sel.range().start);

    return success;
  };

  this.__deleteSingle = function(session, node) {
    var sel = session.sel;
    var doc = session.doc;
    var startChar = sel.startChar();
    var endChar = sel.endChar();
    var editor = this.getEditor(node);

    // Check if the editor allows to delete
    if (!editor.canDelete(node, startChar, endChar)) {
      return false;
    }

    var op = editor.deleteOperation(node, startChar, endChar);
    if (!op) {
      return false;
    }

    doc.apply(op);

    return true;
  };

  this.getEditor = function(node) {
    if (!this.editors[node.type]) {
      this.editors[node.type] = this.editorFactory.createEditor(node.type);
    }
    return this.editors[node.type];
  };

};

RichTextEditor.Prototype.prototype = DocumentController.prototype;
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

    // Note: these stupid 'surface.manipulate' stuff is currently necessary
    // as I could not find another way to distinguish the cases for regular text input
    // and multi-char input. It would not be necessary, if we had a robust way
    // to recognize native key events for that complex chars...
    // However, for now that dirt... we can this streamline in future - for sure...

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
