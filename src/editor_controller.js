"use strict";

var _ = require("underscore");
var util = require("substance-util");
var Document = require("substance-document");
var Annotator = Document.Annotator;
var Selection = Document.Selection;
var Container = require("./container");
var Operator = require("substance-operator");
var NodeSurfaceProvider = require("./node_surface_provider");

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

  this.nodeSurfaceProvider = new NodeSurfaceProvider(document);

  this.container = new Container(document, this.view, this.nodeSurfaceProvider);
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
    // var doc = session.document;
    var sel = session.selection;

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
      this.selection.set(session.selection);
    }
  };

  // Create an annotation of given type for the current selection
  // --------
  //

  // FROM ANNOTATOR
  // var _create = function(self, path, type, range, data) {
  //   var annotation = {
  //     "id": util.uuid(),
  //     "type": type,
  //     "path": path,
  //     "range": range
  //   };

  //   if (data) _.extend(annotation, data);
  //   return self.create(annotation);
  // };

  this.annotate = function(type, data) {
    if (this.selection.isNull()) {
      throw new Error("Nothing selected.");
    }
    if (this.selection.hasMultipleNodes()) {
      throw new Error("Can only annotate within a single node/component.");
    }

    this.__annotate(this.session, type, data);

    // Note: it feels better when the selection is collapsed after setting the annotation style
    // session.selection.collapse("right");

    this.selection.set(this.session.selection);
  };

  this.__annotate = function(session, type, data) {
    var selRange = session.selection.range();
    var pos = selRange.start[0];
    var range = [selRange.start[1], selRange.end[1]];

    var node = session.container.getRootNodeFromPos(pos);
    var component = session.container.getComponent(pos);
    var editor = this.getEditor(node);

    if (!editor.canAnnotate(session, component, type, range)) {
      console.log("Can not annotate component", component);
      return;
    }
    editor.annotate(session, component, type, range, data);
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
      this.selection.set(session.selection);
    }
  };

  this.__write = function(session, text) {
    var sel = session.selection;

    var cursor = sel.getCursor();
    var pos = cursor.nodePos;
    var charPos = cursor.charPos;

    var node = session.container.getRootNodeFromPos(pos);
    var component = session.container.getComponent(pos);
    var editor = this.getEditor(node);

    if (!editor.canInsertContent(session, component, charPos)) {
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
    editor.insertContent(session, component, charPos, text);

    // update the cursor
    sel.set([pos, charPos + text.length]);

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
    var sel = session.selection;

    var cursor = sel.getCursor();
    var pos = cursor.nodePos;

    var node = session.container.getRootNodeFromPos(pos);
    var component = session.container.getComponent(pos);
    var editor = this.getEditor(node);

    if (!editor.canIndent(session, component, direction)) {
      console.log("Can not indent at the given position.");
      return;
    }

    editor.indent(session, component, direction);
    session.save();
  };

  this.addReference = function(label, type, data) {

    if (this.selection.isNull()) {
      console.error("Nothing is selected.");
      return;
    }

    var session = this.startManipulation();

    if (this.__write(session, label)) {
      var sel = session.selection;
      var cursor = sel.getCursor();

      sel.set({
        start: [cursor.nodePos, cursor.charPos-label.length],
        end: [cursor.nodePos, cursor.charPos]
      });
      this.__annotate(session, type, data);

      // Note: it feels better when the selection is collapsed after setting the
      // annotation style
      sel.collapse("right");

      session.save();
      this.selection.set(session.selection);
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
    var pos = session.selection.start[0];
    var node = session.container.getRootNodeFromPos(pos);
    var editor = this.getEditor(node);

    if (!editor.canChangeType(session, node, newType)) {
      return;
    }

    editor.changeType(session, node, pos, newType, data);
    session.save();
  };

  this.canInsertNode = function() {
    var sel = this.selection;
    if (sel.isNull()) {
      return false;
    }

    var cursorPos = sel.range().start;
    var pos = cursorPos[0];
    var charPos = cursorPos[1];

    var component = this.container.getComponent(pos);
    var node = component.node;

    var editor = this.getEditor(node);
    return editor.canBreak(this.session, component, charPos);
  };

  this.insertNode = function(type, data) {
    if (this.selection.isNull()) {
      throw new Error("Selection is null!");
    }

    var session = this.startManipulation();
    var sel = session.selection;

    if (this.__breakNode(session)) {
      var cursorPos = sel.range().start;
      var nodePos = session.container.getNodePos(cursorPos[0]);

      // TODO: create a node with default values
      var newNode = {
        id: type + "_" +util.uuid(),
        type: type
      };
      if (data) {
        _.extend(newNode, data);
      }
      session.document.create(newNode);
      session.document.show(session.view, newNode.id, nodePos);

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
    if (this.canInsertNode()) {
      return allowedActions;
    } else {
      return [];
    }
  };

  this.__breakNode = function(session) {
    var sel = session.selection;
    var cursorPos = sel.range().start;
    var pos = cursorPos[0];
    var charPos = cursorPos[1];

    var component = session.container.getComponent(pos);
    var node = session.container.getRootNodeFromPos(pos);

    // Get the editor and ask for permission to break the node at the given position
    var editor = this.getEditor(node);
    if (!editor.canBreak(session, component, charPos)) {
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
    editor.breakNode(session, component,charPos);

    return true;
  };


  this.__deleteSelection = function(session) {
    var sel = session.selection;

    var success;
    if (sel.hasMultipleNodes()) {
      success = this.__deleteMulti(session);
    } else {
      var pos = sel.start[0];
      var component = session.container.getComponent(pos);
      success = this.__deleteSingle(session, component);
    }

    // in any case after deleting the cursor shall be
    // at the left bound of the selection
    sel.set(sel.range().start);

    return success;
  };

  this.__deleteSingle = function(session, component) {
    var sel = session.selection;
    var node = component.node;
    var startChar = sel.startChar();
    var endChar = sel.endChar();
    var editor = this.getEditor(node);

    // Check if the editor allows to delete
    if (!editor.canDeleteContent(session, component, startChar, endChar)) {
      console.log("Can not delete content", node.type, startChar, endChar);
      return false;
    }

    editor.deleteContent(session, component, startChar, endChar);
    return true;
  };

  this.__deleteMulti = function(session) {
    var ranges = session.selection.getRanges();
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
        canDelete &= editors[i].canDeleteContent(session, r.component, r.start, r.end);
      } else {
        // TODO: who is to decide if a top-level node can be deleted
        // this should be the ViewEditor
        editors[i] = this.getEditor({type: "view", id: this.view});
        canDelete = editors[i].canDeleteNode(session, r.node, r.nodePos);
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
        editors[i].deleteContent(session, r.component, r.start, r.end);
      } else {
        editors[i].deleteNode(session, r.node, r.nodePos);
        session.document.delete(r.node.id);
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

    if (!viewEditor.canDeleteNode(session, second, nodePos)) {
      return false;
    }

    nodeEditor.join(session, first, second);
    viewEditor.deleteNode(session, second, nodePos);
    session.document.delete(second.id);

    return true;
  };

  this.getEditor = function(node) {
    if (!this.editors[node.id]) {
      this.editors[node.id] = this.editorFactory.createEditor(node);
    }
    return this.editors[node.id];
  };

  // Updates the selection considering a given operation
  // -------
  // This is used to set the selection when applying operations that are not triggered by the user interface,
  // e.g., when rolling back or forth with the Chronicle.
  // EXPERIMENTAL
  // FIXME this is broken due to a cleanup during the Composite refactor

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
    // var container = this.container;

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
        console.log("Hmmm... this.should not happen.");
        return;
      }

      var nodePos = -1;
      var charPos = -1;

      // if (node.getChangePosition) {
      //   nodePos = container.getPosition(node.id);
      //   charPos = node.getChangePosition(op);
      // }

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
    var surfaceProvider = this.nodeSurfaceProvider.createCopy(doc);
    var container = new Container(doc, this.view, surfaceProvider);
    var sel = new Selection(container, this.selection);
    return {
      document: doc,
      view: this.view,
      selection: sel,
      annotator: annotator,
      container: container,
      dispose: function() {
        annotator.dispose();
        container.dispose();
      },
      save: function() {
        doc.save();
        this.dispose();
      }
    };
  };

  this.dispose = function() {
    this.annotator.dispose();
    this.container.dispose();
  };

  this.isEditor = function() {
    return true;
  };

  this.createComment = function(comment) {
    this.document.comment(comment);
  };

};

EditorController.prototype = new EditorController.Prototype();

module.exports = EditorController;
