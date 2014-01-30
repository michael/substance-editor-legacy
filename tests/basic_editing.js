"use strict";

// Import
// ========

var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;

var Document = require("substance-document");
var DocumentSession = Document.Session;
var Container = Document.Container;
var EditorController = require("../src/editor_controller");
var SimpleEditorFactory = require("../src/editors/simple_editor_factory");
var TestDocument = require("./test_document");

// Test
// ========
// This test should cover basic editing features implementated in the EditorController.
// It works headless i.e., no DOM checks are involved.
// No node specific specialities are checked, but the basic principles.

var BasicEditing = function() {

  // Deactivate the default fixture for testing basic behavior
  this.setup = function() {
    var doc = new TestDocument({seed: require("./fixture")});
    var nodeSurfaceProvider = new Container.DefaultNodeSurfaceProvider(doc);
    var container = new Container(doc, "content", nodeSurfaceProvider);
    var session = new DocumentSession(container);
    var editorFactory = new SimpleEditorFactory();
    var editor = new EditorController(session, editorFactory);

    this.editor = editor;
    this.session = session;
  };

  this.actions = [

    "Should throw an Error when writing without a selection", function() {
      this.setup();

      this.session.selection.clear();

      assert.exception(EditorController.EditingError, function() {
        this.editor.write("bla");
      }, this);
    },

    "Insert text into a plain text node", function() {
      this.setup();

      var doc = this.session.document;
      var t1 = doc.get("t1");
      var text = t1.content;

      var insertPos = 3;
      var insertedText = "bla";
      var expected = text.substring(0, insertPos) + insertedText + text.substring(insertPos);

      this.session.selection.set([1, insertPos]);
      this.editor.write(insertedText);

      assert.isEqual(expected, t1.content);
    },

    "Insert text at position 0", function() {
      this.setup();

      var doc = this.session.document;
      var t1 = doc.get("t1");
      var text = t1.content;

      var insertPos = 0;
      var insertedText = "bla";
      var expected = insertedText + text;

      this.session.selection.set([1, insertPos]);
      this.editor.write(insertedText);

      assert.isEqual(expected, t1.content);
    },

    "Insert text at last position", function() {
      this.setup();

      var doc = this.session.document;
      var t1 = doc.get("t1");
      var text = t1.content;

      var insertPos = text.length;
      var insertedText = "bla";
      var expected = text + insertedText;

      this.session.selection.set([1, insertPos]);
      this.editor.write(insertedText);

      assert.isEqual(expected, t1.content);
    },

    "Delete a single character", function() {
      this.setup();

      var doc = this.session.document;
      var t1 = doc.get("t1");
      var text = t1.content;

      var deletePos = 3;
      var expected = text.substring(0, deletePos) + text.substring(deletePos+1);

      this.session.selection.set({start: [1, deletePos], end: [1, deletePos+1]});
      this.editor.delete();

      assert.isEqual(expected, t1.content);
    },

    "Delete a single character (expand right)", function() {
      this.setup();

      var doc = this.session.document;
      var t1 = doc.get("t1");
      var text = t1.content;

      var deletePos = 3;
      var expected = text.substring(0, deletePos) + text.substring(deletePos+1);

      this.session.selection.set([1, deletePos]);
      this.editor.delete('right');

      assert.isEqual(expected, t1.content);
    },

    "Delete a single character (expand left)", function() {
      this.setup();

      var doc = this.session.document;
      var t1 = doc.get("t1");
      var text = t1.content;

      var deletePos = 3;
      var expected = text.substring(0, deletePos-1) + text.substring(deletePos);

      this.session.selection.set([1, deletePos]);
      this.editor.delete('left');

      assert.isEqual(expected, t1.content);
    },

    "Delete across node boundary (join nodes)", function() {
      this.setup();

      var doc = this.session.document;
      var t1 = doc.get("t1");
      var t2 = doc.get("t2");
      var text1 = t1.content;
      var text2 = t2.content;

      var charPos = 10;
      var expected = text1.substring(0, charPos) + text2.substring(charPos);

      this.session.selection.set({start: [1, charPos], end: [2, charPos]});
      this.editor.delete();

      assert.isEqual(expected, t1.content);
      assert.isUndefined(doc.get("t2"));
    },

    "Back-Delete at position 0 (join nodes)", function() {
      this.setup();

      var doc = this.session.document;
      var t1 = doc.get("t1");
      var t2 = doc.get("t2");
      var text1 = t1.content;
      var text2 = t2.content;

      var expected = text1 + text2;

      this.session.selection.set([2, 0]);
      this.editor.delete('left');

      assert.isEqual(expected, t1.content);
      assert.isUndefined(doc.get("t2"));
    },

    "Delete single character at last position (join nodes)", function() {
      this.setup();

      var doc = this.session.document;
      var t1 = doc.get("t1");
      var t2 = doc.get("t2");
      var text1 = t1.content;
      var text2 = t2.content;

      var expected = text1 + text2;

      this.session.selection.set([1, text1.length]);
      this.editor.delete('right');

      assert.isEqual(expected, t1.content);
      assert.isUndefined(doc.get("t2"));
    },

    "Join Heading and Text (append to heading)", function() {
      this.setup();

      var doc = this.session.document;
      var h1 = doc.get("h1");
      var t1 = doc.get("t1");
      var text1 = h1.content;
      var text2 = t1.content;

      var expected = text1 + text2;

      this.session.selection.set([0, text1.length]);
      this.editor.delete('right');

      assert.isEqual(expected, h1.content);
      assert.isUndefined(doc.get("t1"));
      assert.isEqual("heading", h1.type);
    },

    "Muli-node delete (Partial/Partial)", function() {
      // should join the nodes
      assert.fail("Not implemented.");
    },

    "Muli-node delete (Full/Partial)", function() {
      // should delete the first
      assert.fail("Not implemented.");
    },

    "Muli-node delete (Full/Full)", function() {
      // should delete both
      assert.fail("Not implemented.");
    },

    "Muli-node delete (Partial/Full)", function() {
      // should delete second
      assert.fail("Not implemented.");
    },

  ];
};

registerTest(['Substance.Surface', 'Basic Editing'], new BasicEditing());
