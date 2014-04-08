"use strict";

// Note: this implementation provides an editor which can also be used under Firefox
// Under Chrome we can use a simpler version.
var BasicEditor = require("./basic_editor");

// The Editor is an editable Surface
// --------
// Don't look too close at this code. It is ugly. Yes. It is.

var Editor = function(docCtrl, renderer, options) {
  BasicEditor.call(this, docCtrl, renderer, options);
};

Editor.Prototype = function() {

  var __super__ = BasicEditor.prototype;

  this._initEditor = function() {
    __super__._initEditor.call(this);

    var self = this;
    var keyboard = this.keyboard;

    this._onMouseup = this.onMouseup.bind(this);
    this._onMousedown = this.onMousedown.bind(this);

    // Key-bindings
    // --------
    keyboard.pass("selection");
    keyboard.bind("selection", "keydown", function() {
      // Note: this is essential for the 'collaboration' with contenteditable
      // Whenever the selection is changed due to keyboard input
      // we just register an update which will be executed after
      // the contenteditable has processed the key.
      window.setTimeout(function() {
        self.updateSelection();
      });
    });

  };

  // Support for Multi-Char inputs
  // --------

  // We ignore selection updates whenever the selection was triggered by the UI
  // For example, when moving the cursor, the selection gets updated by the contenteditable,
  // so it is not necessary to update it again.
  // NOTE: this is optimization and prevents that the model overrules the selection,
  // e.g., if a certain position is not valid w.r.t. to model coordinates.
  // In many cases however, the window selection is resetted unnecessarily.

  // NOTE: I disabled this as it seems premature optimization.
  // TODO: We should find a different way to optimize this. E.g. it could be possible
  // to store the last mapped model coordinates. When the update returns we could check
  // if the model coordinates are still the same.
  // var _ignoreNextSelection = false;

  this.onMousedown = function(e) {
    console.log("Editor.onMousedown", Date.now());
    if (e.target.isContentEditable) {
      this.__selecting = true;
    }
  };

  this.onMouseup = function(e) {
    if (!this.__selecting) {
      return;
    }
    this.__selecting = false;

    var self = this;
    console.log("Editor.onMouseup", Date.now());

    // NOTE: this is important to let the content-editable
    // do the window selection update first
    // strangely, it works almost without it, and is necessary only for one case
    // when setting the cursor into an existing selection (??).
    window.setTimeout(function() {
      // Note: this method implements a try-catch guard triggering an error event
      self.updateSelection(e);
    });

    e.preventDefault();
  };

  // API for handling keyboard input
  // --------
  // Note: it is necessary to react in a delayed fashion using setTimeout
  // as the ContentEditable updates its content after the handler has been invoked

  this.onCursorMoved = function() {
    // call this after the movement has been done by the contenteditable
    // TODO: this is not necessary for node-webkit, is it for browser?
    // setTimeout(function() {
      // Note: this method implements a try-catch guard triggering an error event
      this.updateSelection();
    // }, 0);
  };

  this.activate = function() {
    __super__.activate.call(this);
    console.log("Activating...");
    var el = this.el;
    el.addEventListener("mousedown", this._onMousedown, true);
    window.document.addEventListener("mouseup", this._onMouseup, true);
  };

  this.deactivate = function() {
    __super__.deactivate.call(this);
    var el = this.el;
    el.removeEventListener("mousedown", this._onMousedown, true);
    window.document.removeEventListener("mouseup", this._onMouseup, true);
  };

};
Editor.Prototype.prototype = BasicEditor.prototype;
Editor.prototype = new Editor.Prototype();

module.exports = Editor;
