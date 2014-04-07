"use strict";

var _ = require("underscore");
var util = require("substance-util");
var SurfaceController = require("substance-surface").SurfaceController;

var errors = util.errors;
var EditingError = errors.define("EditingError");


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

var EditorController = function(documentSession, editorFactory) {
  this.session = documentSession;
  this.editorFactory = editorFactory;
  this.editors = {};
};

EditorController.Prototype = function() {

  _.extend(this, util.Events);

  this.isEditor = function() {
    return true;
  };

  this.dispose = function() {
    this.session.dispose();
  };

  // Insert text at the current position
  // --------
  // The selection must not be null otherwise an EditingError is thrown.

  this.write = function(text) {
    var selection = this.session.selection;

    if (selection.isNull()) {
      throw new EditingError("Can not write, the current position is not valid.");
    }

    var session = this.session.startSimulation();

    if (_write(this, session, text)) {
      session.save();
      selection.set(session.selection);
      _afterEdit(this);
    }
  };

  // Delete current selection
  // --------
  //

  this.delete = function(direction) {
    var session = this.session.startSimulation();
    var sel = session.selection;

    // Note: ignoring an invalid selection
    if (sel.isNull()) return;

    if (sel.isCollapsed()) {
      sel.expand(direction, "char");
    }

    if (_deleteSelection(this, session)) {
      session.save();
      this.session.selection.set(sel);
      _afterEdit(this);
    }
  };

  // Insert a break at the current position
  // --------
  // executed when pressing RETURN within a node.

  this.breakNode = function() {
    var selection = this.session.selection;
    if (selection.isNull()) {
      console.error("Can not break, as no position has been selected.");
      return;
    }
    var session = this.session.startSimulation();

    if (_breakNode(this, session)) {
      session.save();
      selection.set(session.selection);
      _afterEdit(this);
    }
  };

  // Behaviors triggered by using `tab` and `shift+tab`.
  // --------
  //
  // Headings and List items can change the level. Text nodes insert a certain amount of spaces.
  //
  // Arguments:
  ///  - `direction`: `right` or `left` (default: `right`)
  this.indent = function(direction) {
    var selection = this.session.selection;
    if (selection.isNull()) {
      console.error("Nothing is selected.");
      return;
    }

    if (selection.hasMultipleNodes()) {
      console.error("Indenting Multi-Node selection is not supported yet.");
      return;
    }

    var session = this.session.startSimulation();
    var sel = session.selection;

    var cursor = sel.getCursor();
    var pos = cursor.pos;

    var node = session.container.getRootNodeFromPos(pos);
    var component = session.container.getComponent(pos);
    var editor = _getEditor(this, node);

    if (!editor.canIndent(session, component, direction)) {
      console.log("Can not indent at the given position.");
      return;
    }

    editor.indent(session, component, direction);
    session.save();
    _afterEdit(this);
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

  this.undo = function() {
    if (!this.session.document.chronicle) return;
    var op = this.session.document.chronicle.rewind();

    if (op && op.data) {
      this.session.selection.set(op.data.selBefore);
    }
  };

  this.redo = function() {
    if (!this.session.document.chronicle) return;
    var op = this.session.document.chronicle.forward();

    if (op && op.data) {
      this.session.selection.set(op.data.selAfter);
    }
  };

  // Create an annotation of given type for the current selection
  // --------
  //
  // TODO: this seems a bit less general. Maybe it should go into the writer controller.
  this.annotate = function(type, data) {
    var selection = this.session.selection;
    if (selection.isNull()) {
      throw new Error("Nothing selected.");
    }
    if (selection.hasMultipleNodes()) {
      throw new Error("Can only annotate within a single node/component.");
    }
    if (selection.isCollapsed()) {
      // nothing to do
      return;
    }

    var session = this.session.startSimulation();

    // TODO: how could this be generalized
    if (type === "remark_reference" || type === "error_reference") {
      data = data || {};
      var issueId = _issue(this, session, type);
      data.target = issueId;
    }

    _annotate(this, session, type, data);

    session.save();

    this.session.selection.set(session.selection);

    _afterEdit(this);
  };


  this.toggleAnnotation = function(type, data) {
    var annos = this.session.annotator.getAnnotations(this.session.selection);
    var anno = null;
    for(var id in annos) {
      if (annos.hasOwnProperty(id)) {
        if (annos[id].type === type) {
          anno = annos[id];
          break;
        }
      }
    }
    if (!anno) {
      this.annotate(type, data);
    } else {
      this.deleteAnnotation(anno.id);
    }
  };

  // This deactivates an annotation
  // ----
  // To allow easy toggling back we will set the selection
  // to the annotated range afterwards.
  this.deleteAnnotation = function(nodeId) {
    var doc = this.session.document;
    var annotation = doc.get(nodeId);

    var component = this.session.container.lookup(annotation.path);

    doc.delete(nodeId);

    this.session.selection.set({
      start: [component.pos, annotation.range[0]],
      end:   [component.pos, annotation.range[1]]
    });

    _afterEdit(this);
  };

  // TODO: from where is this called? seems a bit clumsy...
  this.updateNode = function(nodeId, property, val) {
    this.session.document.set([nodeId, property], val);
    _afterEdit(this);
  };

  // TODO: Hmmm.... I think this is not general editing, but rather special and should
  // go into the writer controller.
  this.addReference = function(type, data) {
    var selection = this.session.selection;
    if (selection.isNull()) {
      console.error("Nothing is selected.");
      return;
    }

    var session = this.session.startSimulation();

    _annotate(this, session, type, data);

    session.save();
    selection.set(session.selection);
    _afterEdit(this);
  };

  // TODO: there is a canInsertNode+insertNode API provided by the ViewEditor which should be used here.
  this.canInsertNode = function() {
    var selection = this.session.selection;
    var container = this.session.container;

    if (selection.isNull()) {
      return false;
    }

    var cursorPos = selection.range().start;
    var pos = cursorPos[0];
    var charPos = cursorPos[1];

    var component = container.getComponent(pos);
    var node = component.root;
    var editor = _getEditor(this, node);

    return editor.canBreak(this.session, component, charPos);
  };

  this.createCitation = function() {
    var doc = this.session.document;
    var node = doc.create({
      id: "webresource_"+util.uuid(),
      type: "webresource",
      url: "http://"
    });

    this.document.show("citations", [node.id]);
    return node.id;
  };

  // TODO: remove
  // -------------

  this.createFigure = function() {
    var doc = this.session.document;

    var caption = {
      id: "text_"+util.uuid(),
      type: "text",
      content: "Enter caption"
    };

    doc.create(caption);

    var figure = {
      type: "figure",
      id: "figure_"+util.uuid(),
      url: "",
      image: "",
      label: "Figure ",
      caption: caption.id
    };

    doc.create(figure);
    doc.show("figures", figure.id);
    return figure.id;
  };


  // TODO: there is a canInsertNode+insertNode API provided by the ViewEditor which should be used here.
  this.insertNode = function(type, data) {
    var selection = this.session.selection;
    if (selection.isNull()) {
      throw new Error("Selection is null!");
    }

    var session = this.session.startSimulation();

    var newNode = {
      id: type + "_" +util.uuid(),
      type: type
    };
    if (data) {
      _.extend(newNode, data);
    }

    if (_insertNode(this, session, newNode)) {
      session.save();
      this.session.selection.set(session.selection);
      _afterEdit(this);
    }
  };

  this.changeType = function(newType, data) {
    // console.log("EditorController.changeType()", newType, data);
    var selection = this.session.selection;
    if (selection.isNull()) {
      console.error("Nothing selected.");
      return;
    }
    if (selection.hasMultipleNodes()) {
      console.error("Can not switch type of multiple nodes.");
      return;
    }

    var session = this.session.startSimulation();
    var pos = session.selection.start[0];
    var component = session.container.getComponent(pos);
    var node = component.root;
    var editor = _getEditor(this, node);

    if (!editor.canChangeType(session, node, newType)) {
      return;
    }

    editor.changeType(session, node, component, newType, data);

    this.ensureLastNode(session);
    session.save();

    this.session.selection.set(selection);

    _afterEdit(this);
  };

  var _insertNode = function(self, session, newNode) {
      var sel = session.selection;

      // if the selection is expanded then delete first
      // Note: this.__deleteSelection collapses the session cursor.
      if (!sel.isCollapsed()) {
        if (!_deleteSelection(self, session)) {
          console.log("Could not delete the selected content");
          return false;
        }
      }

      // HACK: trying to solve an issue with insertNode,
      // which delegates to _breakNode.
      // However, these two cases are not the same when the cursor is at the end of
      // Note: need to update the charPos as the deletion may have changed the cursor
      var cursor = sel.getCursor();
      var pos = cursor.pos;
      var charPos = cursor.charPos;
      var component = session.container.getComponent(pos);

      var cursorPos, nodePos;

      // Note: we have a special treatment here for the case that the cursor is at the end
      // of a component.
      // Then no node-break is necessary and the new node can be inserted right
      // after the current
      if (charPos < component.length) {
        var couldBreak = _breakNode(self, session);
        if (!couldBreak) {
          return false;
        }
        cursorPos = sel.range().start;
        nodePos = session.container.getNodePos(cursorPos[0]);
      } else {
        cursorPos = sel.range().start;
        nodePos = session.container.getNodePos(cursorPos[0]) + 1;
      }

      session.document.create(newNode);
      session.document.show(session.view, newNode.id, nodePos);

      //EXPERIMENTAL: Set the cursor into the node
      // TODO: evaluate if it is a good approach to set the cursor into
      // the first component at position 0.
      var components = session.container.getNodeComponents(newNode.id);
      if (components.length > 0) {
        sel.set([components[0].pos, 0]);
      }

      self.ensureLastNode(session);

      return true;
  };

  this._insertNode = function(session, newNode) {
    return _insertNode(this, session, newNode);
  };



  this.createComment = function(comment) {
    this.session.document.comment(comment);
  };

  // HACK: this should be created dynamically...
  var _allowedActions = [
    {
      action: "createNode",
      type: "heading",
      data: {
        level: 1
      }
    },
    {
      action: "createNode",
      type: "figure",
      data: {
      }
    },
    {
      action: "createNode",
      type: "codeblock",
      data: {
      }
    }
  ];

  util.freeze(_allowedActions);

  this.getAllowedActions = function() {
    // TODO: When cursor is within a figure caption, do not allow
    // figure insertion etc.
    if (this.canInsertNode()) {
      return _allowedActions;
    } else {
      return [];
    }
  };

  this.ensureLastNode = function(session) {
    var viewEditor = _getEditor(this, {type: "view", id: session.container.name});
    if (viewEditor.ensureLastNode) viewEditor.ensureLastNode(session);
  };

  // Private functions
  // ........

  var _annotate = function(self, session, type, data) {
    var selRange = session.selection.range();
    var pos = selRange.start[0];
    var range = [selRange.start[1], selRange.end[1]];

    var node = session.container.getRootNodeFromPos(pos);
    var component = session.container.getComponent(pos);
    var editor = _getEditor(self, node);

    if (!editor.canAnnotate(session, component, type, range)) {
      console.log("Can not annotate component", component);
      return;
    }
    editor.annotate(session, component, type, range, data);

    session.selection.set(selRange);
  };

  var _afterEdit = function(self) {
    var doc = self.session.document;

    // setting a 'master' reference to the current state
    if (doc.chronicle) {
      doc.chronicle.mark("master");
    }
    self.trigger("document:edited");
  };

  // Expose to outside
  this._afterEdit = function() {
    _afterEdit(this);
  };

  var _getEditor = function(self, node) {
    if (!self.editors[node.id]) {
      self.editors[node.id] = self.editorFactory.createEditor(node);
    }
    return self.editors[node.id];
  };

  var _write = function(self, session, text) {
    var sel = session.selection;

    // if the selection is expanded then delete first
    // Note: this.__deleteSelection collapses the session cursor.
    if (!sel.isCollapsed()) {
      if (!_deleteSelection(self, session)) {
        console.log("Could not delete the selected content");
        return false;
      }
    }

    var cursor = sel.getCursor();
    var pos = cursor.pos;
    var charPos = cursor.charPos;

    var node = session.container.getRootNodeFromPos(pos);
    var component = session.container.getComponent(pos);
    var editor = _getEditor(self, node);

    if (!editor.canInsertContent(session, component, charPos)) {
      console.log("Can not insert at the given position.");
      return false;
    }

    // Ask for an operation and abort if no operation is given.
    editor.insertContent(session, component, charPos, text);

    // update the cursor
    sel.set([pos, charPos + text.length]);

    return true;
  };

  var _breakNode = function(self, session) {
    var sel = session.selection;
    var cursorPos = sel.range().start;
    var pos = cursorPos[0];
    var charPos = cursorPos[1];

    var component = session.container.getComponent(pos);
    var node = session.container.getRootNodeFromPos(pos);

    // Get the editor and ask for permission to break the node at the given position
    var editor = _getEditor(self, node);
    if (!editor.canBreak(session, component, charPos)) {
      return false;
    }

    // if the selection is expanded then delete first
    // Note: this.__deleteSelection collapses the session cursor.
    if (!sel.isCollapsed()) {
      if (!_deleteSelection(self, session)) {
        console.log("Could not delete the selected content");
        return false;
      }
    }

    // Note: need to update the charPos as the deletion may have changed the cursor
    charPos = sel.getCursor().charPos;

    // Let the editor apply operations to break the node
    editor.breakNode(session, component, charPos);

    return true;
  };

  var _deleteSelection = function(self, session) {
    var sel = session.selection;

    // after deleting the cursor shall be
    // at the left bound of the selection
    var newPos = sel.range().start;

    var success;
    if (sel.hasMultipleNodes()) {
      success = _deleteMulti(self, session);
    } else {
      var pos = sel.start[0];
      var component = session.container.getComponent(pos);
      success = _deleteSingle(self, session, component);
    }

    sel.set(newPos);

    self.ensureLastNode(session);

    return success;
  };

  var _deleteSingle = function(self, session, component) {
    var sel = session.selection;
    var node = session.container.getRootNodeFromPos(component.pos);

    var startChar = sel.startChar();
    var endChar = sel.endChar();
    var editor = _getEditor(self, node);

    // Check if the editor allows to delete
    if (!editor.canDeleteContent(session, component, startChar, endChar)) {
      console.log("Can not delete content", node.type, startChar, endChar);
      return false;
    }

    editor.deleteContent(session, component, startChar, endChar);

    return true;
  };

  // Note: with the new `component` concept we have to address this in a different way.
  // I.e., a node might be represented by multiple components and not all of them are selected.
  // If a node is fully selected then we can try to delete it from the view,
  // otherwise the node must support partial deletion.
  // TODO: try to stream-line this implementation.
  var _deleteMulti = function(self, session) {
    var ranges = session.selection.getRanges();
    var container = session.container;

    var i, r, node;
    // collect information about deletions during the check
    var cmds = [];
    var viewEditor = _getEditor(self, {type: "view", id: container.name});

    // Preparation: check that all deletions can be applied and
    // prepare commands for an easy deletion
    for (i = 0; i < ranges.length; i++) {
      r = ranges[i];
      node = r.component.root;
      var canDelete;
      var editor;

      // Note: this checks if a node is fully selected via a heuristic:
      // if the selection has enough components to cover the full node and the first and last components
      // are fully selected, then the node is considered as fully selected.
      var nodeComponents = container.getNodeComponents(node.id);
      var firstIdx = i;
      var lastIdx = firstIdx + nodeComponents.length - 1;

      // if it is a full selection schedule a command to delete the node
      var isFull = r.isFull() && ranges[lastIdx].isFull();

      // HACK: if the last is an empty node it will show always as fully selected
      // However, in that case it should remain only if the first one is fully selected.
      // TODO: rename Range.length() to Range.getLength() or add a property getter
      if (i === ranges.length-1 && ranges[lastIdx].length() === 0 && ranges[0].isFull()) {
        isFull = false;
      }

      if (lastIdx < ranges.length && isFull) {
        editor = viewEditor;
        canDelete = editor.canDeleteNode(session, node);
        cmds.push({type: "node", editor: editor, range: r});
      }
      // ... otherwise schedule a command for trimming the node.
      else {
        editor = _getEditor(self, node);
        for (var j=firstIdx; j<=lastIdx; j++) {
          r = ranges[j];
          canDelete = editor.canDeleteContent(session, r.component, r.start, r.end);
          cmds.push({type: "content", editor: editor, range: r});
        }
      }

      i = lastIdx;

      // TODO: we need add a mechanism to provide a feedback about that, e.g., so that the UI can display some
      // kind of messsage
      if (!canDelete) {
        console.log("Can't delete component:", r.component);
        return false;
      }
    }

    // If the first and the last selected node have been partially selected
    // then we will try to join these nodes
    var doJoin = (ranges.length > 0 && ranges[0].isPartial() && ranges[ranges.length-1].isPartial());

    // Perform the deletions

    // ATTENTION: we have to perform the deletions in inverse order so that the node positions remain valid
    for (i = cmds.length - 1; i >= 0; i--) {
      var c = cmds[i];
      r = c.range;

      if (c.type === "content") {
        c.editor.deleteContent(session, r.component, r.start, r.end);
      } else {
        node = r.component.root;
        c.editor.deleteNode(session, node);
        // TODO: in theory it might be possible that nodes are referenced somewhere else
        // however, we do not yet consider such situations and delete the node instantly
        session.document.delete(node.id);
      }
    }

    // ATTENTION: after this point the range objects are invalid as some components may have been deleted

    // Perform a join
    if (doJoin) {
      // Retrieve updated components
      var first = ranges[0].component.root;
      var second = ranges[ranges.length-1].component.root;
      _join(self, session, first, second);
    }

    return true;
  };

  var _join = function(self, session, first, second) {

    var nodeEditor = _getEditor(self, first);
    var viewEditor = _getEditor(self, {type: "view", id: session.container.name});

    if (!nodeEditor.canJoin(session, first, second)) {
      return false;
    }

    if (!viewEditor.canDeleteNode(session, second)) {
      return false;
    }

    nodeEditor.join(session, first, second);
    viewEditor.deleteNode(session, second);
    session.document.delete(second.id);

    return true;
  };



  // TODO: this should be done via the node classes
  var _issueType = {
    "error_reference": "error",
    "remark_reference": "remark"
  };

  var _issueContainer = {
    "error": "errors",
    "remark": "remarks"
  };

  var _issue = function(self, session, annoType) {
    var type = _issueType[annoType];
    var container = _issueContainer[type];

    if (!type) {
      throw new Error("Unsupported issue type:" + annoType);
    }

    var doc = session.document;
    var issue = {
      id: type+"_" + util.uuid(),
      type: type,
      created_at: new Date(),
      // TODO: Use full username from operating system
      creator: Math.random()>0.5 ? "Michael Aufreiter" : "Oliver Buchtala"
    };
    doc.create(issue);
    doc.show(container, [issue.id]);
    return issue.id;
  };
};


EditorController.Prototype.prototype = SurfaceController.prototype;
EditorController.prototype = new EditorController.Prototype();

Object.defineProperties(EditorController.prototype, {
  "selection": {
    get: function() {
      return this.session.selection;
    },
    set: function() {
      throw new Error("Immutable.");
    }
  },
  "annotator": {
    get: function() {
      return this.session.annotator;
    },
    set: function() {
      throw new Error("Immutable.");
    }
  },
  "container": {
    get: function() {
      return this.session.container;
    },
    set: function() {
      throw new Error("Immutable.");
    }
  },
  "document": {
    get: function() {
      return this.session.document;
    },
    set: function() {
      throw new Error("Immutable.");
    }
  },
  "view": {
    get: function() {
      // TODO: 'view' is not very accurate as it is actually the name of a view node
      // Beyond that 'view' as a node type is also confusing considering the Views.
      // console.log("TODO: rename this property.");
      return this.session.container.name;
    },
    set: function() {
      throw new Error("Immutable.");
    }
  }
});

EditorController.EditingError = EditingError;
module.exports = EditorController;
