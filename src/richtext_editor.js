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

  // var __super__ = DocumentController.prototype;

  // Delete current selection
  // --------
  //

  this.delete = function(direction) {
    var session = this.startManipulation();
    // var doc = session.doc;
    var sel = session.sel;

    console.log(sel);

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
    if (!editor.canBreak(session, node, charPos)) {
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
    editor.breakNode(session, node, nodePos, charPos);
    session.save();
    // update the cursor
    var newCursorPos = [nodePos+1, 0];
    this.selection.set(newCursorPos);
  };

  // Create an annotation of given type for the current selection
  // --------
  //

  this.annotate = function(type, data) {
    var session = this.startManipulation();
    // var newCursorPos = session.sel.range().start;
    session.annotator.annotate(session.sel, type, data);
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
    var sel = session.sel;

    var node = sel.getNodes()[0];
    var cursorPos = sel.range().start;
    var nodePos = cursorPos[0];
    var charPos = cursorPos[1];

    // Get the editor and ask for permission to insert text at the given position
    var editor = this.getEditor(node);
    if (!editor.canInsert(session, node, charPos)) {
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
    editor.insertContent(session, node, charPos, text);
    session.save();
    // update the cursor
    this.selection.set([nodePos, charPos + text.length]);
  };

  this.changeType = function(newType, data) {
    console.log("RichTextEditor.changeType()", newType, data);

    if (this.selection.isNull()) {
      console.error("Nothing selected.");
      return;
    }
    if (this.selection.hasMultipleNodes()) {
      console.error("Can not switch type of multiple nodes.");
      return;
    }

    var session = this.startManipulation();
    var sel = session.sel;
    var nodePos = session.sel.start[0];
    var node = sel.getNodes()[0];

    var editor = this.getEditor(node);
    if (!editor.canChangeType(session, node, newType)) {
      return;
    }

    editor.changeType(session, node, nodePos, newType, data);
    session.save();
  };

  this.__deleteSelection = function(session) {
    var sel = session.sel;
    var nodes = sel.getNodes();

    var success;
    if (nodes.length === 1) {
      success = this.__deleteSingle(session, nodes[0]);
    } else {
      success = this.__deleteMulti(session);
    }

    // in any case after deleting the cursor shall be
    // at the left bound of the selection
    sel.set(sel.range().start);

    return success;
  };

  this.__deleteSingle = function(session, node) {
    var sel = session.sel;
    var startChar = sel.startChar();
    var endChar = sel.endChar();
    var editor = this.getEditor(node);

    // Check if the editor allows to delete
    if (!editor.canDelete(session, node, startChar, endChar)) {
      console.log("Can not delete node", node.type, startChar, endChar);
      return false;
    }

    editor.deleteContent(session, node, startChar, endChar);
    return true;
  };

  this.__deleteMulti = function(session) {
    var ranges = session.sel.getRanges();
    var editors = [];

    var i, r;

    // Pre-check: can all deletions be applied?
    // -> partial deletions for first and last
    // -> full node deletion for inner nodes
    var canDelete = true;
    for (i = 0; i < ranges.length; i++) {
      r = ranges[i];

      if (i === 0 || i === ranges.length-1) {
        editors[i] = this.getEditor(r.node);
        canDelete &= editors[i].canDelete(session, r.node, r.start, r.end);
      } else {
        // TODO: who is to decide if a top-level node can be deleted
        // this should be the ViewEditor
        editors[i] = this.getEditor({type: "view", id: this.view});
        canDelete = editors[i].canDelete(session, r.node, r.nodePos);
      }

      if (!canDelete) {
        console.log("Can't delete node:", r.node, r.nodePos);
        return false;
      }
    }

    // Perform the deletions
    for (i = 0; i < ranges.length; i++) {
      r = ranges[i];
      if (i === 0 || i === ranges.length-1) {
        editors[i].deleteContent(session, r.node, r.start, r.end);
      } else {
        editors[i].deleteNode(session, r.node, r.nodePos);
        session.doc.delete(r.node.id);
      }
    }

    // TODO: Join the first with the last
    this.__join(session, ranges[0], ranges[ranges.length-1]);

    return true;
  };

  this.__join = function(session, r1, r2) {

    var first = r1.node;
    var second = r2.node;
    var nodePos = r1.nodePos + 1;

    var nodeEditor = this.getEditor(first);
    var viewEditor = this.getEditor({type: "view", id: this.view});

    if (!nodeEditor.canJoin(session, first, second)) {
      return false;
    }

    if (!viewEditor.canDelete(session, second, nodePos)) {
      return false;
    }

    nodeEditor.join(session, first, second);
    viewEditor.deleteNode(session, second, nodePos);
    session.doc.delete(second.id);

    return true;
  };

  this.getEditor = function(node) {
    if (!this.editors[node.type]) {
      this.editors[node.id] = this.editorFactory.createEditor(node);
    }
    return this.editors[node.id];
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
        "alt+up", "alt+down", "alt+left", "alt+right",
        "alt+shift+up", "alt+shift+down", "alt+shift+left", "alt+shift+right",
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

    keyboard.bind(["ctrl+b"], surface.manipulate(function() {
      docCtrl.annotate("strong");
    }), "keydown");

    keyboard.bind(["ctrl+i"], surface.manipulate(function() {
      docCtrl.annotate("emphasis");
    }), "keydown");

    keyboard.bind(["ctrl+c"], surface.manipulate(function() {
      docCtrl.copy();
    }), "keydown");

    keyboard.bind(["ctrl+v"], surface.manipulate(function() {
      docCtrl.paste();
    }), "keydown");

    // EXPERIMENTAL hooks for creating new node and annotation types

    keyboard.bind(["ctrl+shift+c"], surface.manipulate(function() {
      docCtrl.annotate("issue");
    }), "keydown");

    keyboard.bind(["ctrl+shift+m"], surface.manipulate(function() {
      docCtrl.annotate("math");
    }), "keydown");

    keyboard.bind(["ctrl+shift+t"], surface.manipulate(function() {
      docCtrl.changeType("text");
    }), "keydown");

    keyboard.bind(["ctrl+shift+h 1"], surface.manipulate(function() {
      docCtrl.changeType("heading", {"level": 1});
    }), "keydown");

    keyboard.bind(["ctrl+shift+h 2"], surface.manipulate(function() {
      docCtrl.changeType("heading", {"level": 2});
    }), "keydown");

    keyboard.bind(["ctrl+shift+h 3"], surface.manipulate(function() {
      docCtrl.changeType("heading", {"level": 3});
    }), "keydown");

    keyboard.connect(surface.el);
  };

  this.disconnect = function() {
    keyboard.disconnect();
  };
};

module.exports = RichTextEditor;
