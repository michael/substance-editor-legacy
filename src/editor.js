"use strict";

var Surface = require("substance-surface");
var Keyboard = require("substance-commander").ChromeKeyboard;

// The Editor is an editable Surface
// --------
// Don't look too close at this code. It is ugly. Yes. It is.

var Editor = function(docCtrl, renderer, options) {
  Surface.call(this, docCtrl, renderer);

  options = options || {};
  var keymap = options.keymap || Editor._getDefaultKeyMap();
  this.keyboard = new Keyboard(keymap);
  var keyboard = this.keyboard;

  var self = this;
  var el = this.el;
  var $el = this.$el;
  var editorCtrl = docCtrl;

  el.spellcheck = false;

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

  var _onMouseup = function(e) {
    // _ignoreNextSelection = true;
    setTimeout(function() {
      self.updateSelection(e);
    }, 0);
  };

  // Updates the window selection whenever the model selection changes
  // --------
  // TODO: we should think about how this could be optimized.
  // ATM, a window selection change, e.g., when moving the cursor,
  // triggers a model selection update, which in turn triggers a window selection update.
  // The latter would not be necessary in most cases.
  var onSelectionChanged = function() {
    // if (_ignoreNextSelection === true) {
    //   _ignoreNextSelection = false;
    //   return;
    // }
    return self.renderSelection.apply(self, arguments);
  };

  // Override the dispose method to bind extra disposing stuff
  // --------
  // TODO: we should really consider to make this an independet class instead of a mix-in
  // and let the surface call the dispose explicitely

  var __dispose__ = this.dispose;
  this.dispose = function() {
    __dispose__.call(this);
    this.deactivate();
  };

  // API for handling keyboard input
  // --------
  // Note: it is necessary to react in a delayed fashion using setTimeout
  // as the ContentEditable updates its content after the handler has been invoked

  this.onCursorMoved = function() {
    // call this after the movement has been done by the contenteditable
    setTimeout(function() {
      // _ignoreNextSelection = true;
      self.updateSelection();
    }, 0);
  };

  // Key-bindings
  // --------

  keyboard.bind("selection", "keydown", function() {
    self.onCursorMoved();
  });

  // Note: these stupid 'surface.manipulate' stuff is currently necessary
  // as I could not find another way to distinguish the cases for regular text input
  // and multi-char input. It would not be necessary, if we had a robust way
  // to recognize native key events for that complex chars...
  // However, for now that dirt... we can this streamline in future - for sure...

  keyboard.bind("backspace", "keydown", function(e) {
    editorCtrl.delete("left");
    e.preventDefault();
    e.stopPropagation();
  });

  keyboard.bind("delete", "keydown", function(e) {
    editorCtrl.delete("right");
    e.preventDefault();
    e.stopPropagation();
  });

  keyboard.bind("break", "keydown", function(e) {
    editorCtrl.breakNode();
    e.stopPropagation();
  });

  keyboard.bind("soft-break", "keydown", function(e) {
    editorCtrl.write("\n");
    e.stopPropagation();
  });

  keyboard.bind("blank", "keydown", function(e) {
    editorCtrl.write(" ");
    e.preventDefault();
    e.stopPropagation();
  });

  keyboard.bind("indent", "keydown", function(e) {
    editorCtrl.indent("right");
    e.stopPropagation();
  });

  keyboard.bind("unindent", "keydown", function(e) {
    editorCtrl.indent("left");
    e.stopPropagation();
  });

  keyboard.bind("undo", "keydown", function(e) {
    editorCtrl.undo();
    e.preventDefault();
    e.stopPropagation();
  });

  keyboard.bind("redo", "keydown", function(e) {
    editorCtrl.redo();
    e.preventDefault();
    e.stopPropagation();
  });

  keyboard.bind("strong", "keydown", function(e) {
    editorCtrl.annotate("strong");
    e.stopPropagation();
  });

  keyboard.bind("emphasis", "keydown", function(e) {
    editorCtrl.annotate("emphasis");
    e.stopPropagation();
  });

  // EXPERIMENTAL hooks for creating new node and annotation types

  keyboard.bind("heading", "keydown", function(e) {
    editorCtrl.insertNode("heading", {"level": 1});
    e.stopPropagation();
  });

  keyboard.bind("list", "keydown", function(e) {
    editorCtrl.insertList();
    e.stopPropagation();
  });

  keyboard.bind("paste", "keydown", keyboard.PASS);

  keyboard.setDefaultHandler("keypress", function(e) {
    //console.log("Editor keypress", e, keyboard.describeEvent(e));
    editorCtrl.write(String.fromCharCode(e.which));
    e.preventDefault();
    e.stopPropagation();
  });

  keyboard.setDefaultHandler("keyup", function(e) {
    //console.log("Editor keyup", e, keyboard.describeEvent(e));
    e.preventDefault();
    e.stopPropagation();
  });

  keyboard.setDefaultHandler("keydown", function(e) {
    //console.log("Editor keydown", e, keyboard.describeEvent(e));
    // TODO: detect all multi-char inputs, and remember that information
    // to augment the next keypressed character
    if (e.keyCode === 229 || e.keyCode === 192) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  this.onTextInput = function(e) {
    //console.log("Editor onTextInput", e);

    if (e.data) {
      // HACK: the contenteditable when showing the character selection popup
      // will change the selection to the previously inserted char... magigally
      // We transfer the selection to the model and then write the text input.
      setTimeout(function() {
        self.updateSelection();
        editorCtrl.write(e.data);
      }, 0);
    }
    e.preventDefault();
    e.stopPropagation();
  };

  // Initialization
  // --------

  this.activate = function() {
    this.listenTo(editorCtrl.session.selection,  "selection:changed", onSelectionChanged);
    el.addEventListener("textInput", this.onTextInput, true);
    el.addEventListener("input", this.onTextInput, true);
    $el.mouseup(_onMouseup);
    keyboard.connect(el);
    el.setAttribute("contenteditable", "true");
  };

  this.deactivate = function() {
    this.stopListening();
    el.removeEventListener("textInput", this.onTextInput, true);
    el.removeEventListener("input", this.onTextInput, true);
    $el.off('mouseup');
    keyboard.disconnect();
    el.setAttribute("contenteditable", "true");
  };

  this.activate();
};


Editor._getDefaultKeyMap = function() {
  var keymap = require("./default_keymap_osx");
  if (global.navigator !== undefined) {
    var platform = global.navigator.platform;
    if (platform.toLowerCase().search("linux") >= 0) {
      keymap = require("./default_keymap_unix");
    }
    else if (platform.toLowerCase().search("win32") >= 0) {
      // currently we use the same keymap for linux and win
      keymap = require("./default_keymap_unix");
    }
  }
  return keymap;
};

Editor.Prototype = function() {
};
Editor.Prototype.prototype = Surface.prototype;
Editor.prototype = new Editor.Prototype();


module.exports = Editor;
