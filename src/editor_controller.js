"use strict";

var _ = require("underscore");
var util = require("substance-util");
var Document = require("substance-document");
var Annotator = Document.Annotator;
var Selection = Document.Selection;
var Container = require("./container");
var Operator = require("substance-operator");

// A Controller that makes Nodes and a Document.Container editable
// ========
//
// This editor is tailored to a very simple use-case: documents that consist only
// of Text, Headings, and Lists. These nodes are presented in a flow and
// editing is similar as it is known from GDocs or Microsoft Word,
// and not structurally as in earlier Substance versions
// or known from other Web-based editors (e.g. medium.com).
// By providing a custom factory for Node editors it is possible
// to control what and how the content is editable.

// TODO: there is an ugliness now with the Container. Container is rather coupled to a Renderer.
// Selections occur in the view domain and thus depend on the rendering.

var EditorController = function(document, editorFactory, options) {
  options = options || {};

  this.document = document;
  this.view = options.view || 'content';
  this.annotator = new Annotator(document);
  this.editorFactory = editorFactory;
  this.editors = {};

  // HACK: Container depends on a renderer. You can provide a renderer via options.renderer
  // or you can set the renderer afterwards. Then you have to call container.rebuild().
  this.container = new Container(document, this.view, options.renderer);
  this.selection = new Selection(this.container);

  // HACK: we will introduce a DocumentSession which is the combination
  // of Document, Container, Selection and Annotator
  this.session = {
    "controller": this,
    "document": this.document,
    "selection": this.selection,
    "container": this.container,
    "annotator": this.annotator
  };
};

EditorController.Prototype = function() {

  _.extend(this, util.Events.Listener);

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

    if (this.__breakNode(session)) {
      session.save();
      this.selection.set(session.sel);
    }
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

    if (this.__write(session, text)) {
      session.save();
      this.selection.set(session.sel);
    }
  };

  this.__write = function(session, text) {
    var sel = session.sel;

    var node = sel.getNodes()[0];
    var cursorPos = sel.range().start;
    var nodePos = cursorPos[0];
    var charPos = cursorPos[1];

    // Get the editor and ask for permission to insert text at the given position
    var editor = this.getEditor(node);
    if (!editor.canInsert(session, node, charPos)) {
      console.log("Can not insert at the given position.");
      return false;
    }

    // if the selection is expanded then delete first
    // Note: this.__deleteSelection collapses the session cursor.
    if (!sel.isCollapsed()) {
      if (!this.__deleteSelection(session)) {
        console.log("Could not delete the selected content");
        return false;
      }
    }

    // Ask for an operation and abort if no operation is given.
    editor.insertContent(session, node, charPos, text);

    // update the cursor
    sel.set([nodePos, charPos + text.length]);

    return true;
  };

  // Behaviors triggered by using `tab` and `shift+tab`.
  // --------
  //
  // Headings and List items change the level. Text nodes insert a certain amount of spaces.
  //
  // Arguments:
  ///  - `direction`: `right` or `left` (default: `right`)
  this.indent = function(direction) {
    if (this.selection.isNull()) {
      console.error("Nothing is selected.");
      return;
    }

    if (this.selection.hasMultipleNodes()) {
      console.error("Indenting Multi-Node selection is not supported yet.");
      return;
    }

    var session = this.startManipulation();
    var sel = session.sel;
    var node = sel.getNodes()[0];

    var editor = this.getEditor(node);
    if (!editor.canIndent(session, node, direction)) {
      console.log("Can not indent at the given position.");
      return;
    }

    editor.indent(session, node, direction);
    session.save();
  };

  this.addReference = function(label, type, data) {

    if (this.selection.isNull()) {
      console.error("Nothing is selected.");
      return;
    }

    var session = this.startManipulation();

    if (this.__write(session, label)) {
      var sel = session.sel;
      var cursor = sel.getCursor();

      sel.set({
        start: [cursor.nodePos, cursor.charPos-label.length],
        end: [cursor.nodePos, cursor.charPos]
      });

      session.annotator.annotate(sel, type, data);
      // Note: it feels better when the selection is collapsed after setting the
      // annotation style
      sel.collapse("right");

      session.save();
      this.selection.set(session.sel);
    }

  };

  this.changeType = function(newType, data) {
    console.log("EditorController.changeType()", newType, data);

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

  this.canInsert = function() {
    var sel = this.selection;
    if (sel.isNull()) {
      return false;
    }
    var node = sel.getNodes()[0];
    var cursorPos = sel.range().start;
    var charPos = cursorPos[1];

    // Get the editor and ask for permission to break the node at the given position
    var editor = this.getEditor(node);
    return editor.canBreak(this.session, node, charPos);
  };

  this.insertNode = function(type, data) {
    if (this.selection.isNull()) {
      throw new Error("Selection is null!");
    }
    var session = this.startManipulation();
    var sel = session.sel;

    if (this.__breakNode(session)) {
      var cursorPos = sel.range().start;
      var nodePos = cursorPos[0];
      // TODO: create a node with default values
      var newNode = {
        id: type + "_" +util.uuid(),
        type: type
      };
      if (data) {
        _.extend(newNode, data);
      }
      session.doc.create(newNode);
      session.doc.show(session.view, newNode.id, nodePos);

      session.save();
    }
  };

  // HACK: this should be created dynamically...
  var allowedActions = [
    {
      action: "create",
      type: "heading",
      data: {
        level: 1
      }
    }
  ];
  util.freeze(allowedActions);

  this.getAllowedActions = function() {
    if (this.canInsert()) {
      return allowedActions;
    } else {
      return [];
    }
  };

  this.__breakNode = function(session) {
    var sel = session.sel;
    var node = sel.getNodes()[0];
    var cursorPos = sel.range().start;
    var nodePos = cursorPos[0];
    var charPos = cursorPos[1];

    // Get the editor and ask for permission to break the node at the given position
    var editor = this.getEditor(node);
    if (!editor.canBreak(session, node, charPos)) {
      return false;
    }

    // if the selection is expanded then delete first
    // Note: this.__deleteSelection collapses the session cursor.
    if (!sel.isCollapsed()) {
      if (!this.__deleteSelection(session)) {
        console.log("Could not delete the selected content");
        return false;
      }
    }

    // Let the editor apply operations to break the node
    editor.breakNode(session, node, nodePos, charPos);

    // update the cursor
    var newCursorPos = [nodePos+1, 0];
    sel.set(newCursorPos);

    return true;
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

  // Updates the selection considering a given operation
  // -------
  // This is used to set the selection when applying operations that are not triggered by the user interface,
  // e.g., when rolling back or forth with the Chronicle.
  // EXPERIMENTAL

  var _updateSelection = function(op) {

    // TODO: this needs a different approach.
    // With compounds, the atomic operation do not directly represent a natural behaviour
    // I.e., the last operation applied does not represent the position which is
    // desired for updating the cursor
    // Probably, we need to handle that behavior rather manually knowing
    // about possible compound types...
    // Maybe we could use the `alias` field of compound operations to leave helpful information...
    // However, we post-pone this task as it is rather cosmetic

    if (!op) return;

    // var view = this.view;
    var doc = this.document;
    var container = this.container;

    function getUpdatedPostion(op) {

      // We need the last update which is relevant to positioning...
      // 1. Update of the content of leaf nodes: ask node for an updated position
      // 2. Update of a reference in a composite node:
      // TODO: fixme. This does not work with deletions.

      // changes to views or containers are always updates or sets
      // as they are properties
      if (op.type !== "update" && op.type !== "set") return;

      // handle changes to the view of nodes
      var node = doc.get(op.path[0]);

      if (!node) {
        console.log("Hmmm... this.should not happen, though.");
        return;
      }

      var nodePos = -1;
      var charPos = -1;

      if (node.isComposite()) {
        // TODO: there is no good concept yet
      } else if (node.getChangePosition) {
        nodePos = container.getPosition(node.id);
        charPos = node.getChangePosition(op);
      }

      if (nodePos >= 0 && charPos >= 0) {
        return [nodePos, charPos];
      }
    }


    // TODO: actually, this is not yet an appropriate approach to update the cursor position
    // for compounds.
    Operator.Helpers.each(op, function(_op) {
      var pos = getUpdatedPostion(_op);
      if (pos) {
        this.selection.set(pos);
        // breaking the iteration
        return false;
      }
    }, this, "reverse");

  };

  this.undo = function() {
    if (!this.document.chronicle) return;
    var op = this.document.chronicle.rewind();
    _updateSelection.call(this, op);
  };

  this.redo = function() {
    if (!this.document.chronicle) return;
    var op = this.document.chronicle.forward();
    _updateSelection.call(this, op);
  };

  this.startManipulation = function() {
    var doc = this.document.startSimulation();
    var annotator = new Annotator(doc, {withTransformation: true});
    var container = new Container(doc, this.view, this.container.renderer);
    var sel = new Selection(container, this.selection);
    return {
      doc: doc,
      view: this.view,
      sel: sel,
      annotator: annotator,
      save: function() { doc.save(); }
    };
  };

  this.dispose = function() {
    this.annotator.dispose();
  };

  this.isEditor = function() {
    return true;
  };

};

EditorController.prototype = new EditorController.Prototype();

module.exports = EditorController;
