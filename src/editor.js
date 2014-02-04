"use strict";

var Surface = require("substance-surface");

// The Editor is an editable Surface
// --------
// Don't look too close at this code. It is ugly. Yes. It is.

var Editor = function(docCtrl, renderer, options) {
  Surface.call(this, docCtrl, renderer);

  options = options || {};
  var keymap = options.keymap || Editor._getDefaultKeyMap();
  var keyboard = new Keyboard(docCtrl, keymap);

  var self = this;
  var el = this.el;
  var $el = this.$el;
  var editorCtrl = docCtrl;

  el.setAttribute("contenteditable", "true");
  el.spellcheck = false;

  // Support for Multi-Char inputs
  // --------

  // this array will be filled by the mutation observer
  // with tuples {el, val} which represent the old state
  // before the DOM mutation.
  // In some cases, e.g. multi-chars, the DOM gets manipulated several times
  // but only the last time a textinput event is triggered.
  // Before applying delivering the textinput to the editor controller
  // we reset the content of the element.
  // Otherwise the editing change would be applied to the DOM a second time.
  var _domChanges = [];
  var _recordMutations = false;

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
    self.updateSelection(e);
  };

  var _onKeyDown = function() {
    // TODO: we should enable this mechanism more specifically
    // I.e. by adding keycodes for possible multi-char keys
    _recordMutations = true;
  };


  // The textinput event is fired after typing and pasting.
  // This approach is rather questionable, as there are browser incompatibilities.
  // The benefit of it is an easier way to interpret keyevents.

  var _onTextInput = function(e) {
    // console.log("Surface.Editing._onTextInput", e.data, _domChanges);

    if (_recordMutations && _domChanges.length > 0) {
      var change = _domChanges[0];
      change.el.textContent = change.val;
    }
    _recordMutations = false;

    if (!e.data) {
      console.error("It happened that the textinput event had no data. Investigate!");
    } else {
      editorCtrl.write(e.data);
      e.preventDefault();
    }
  };

  var _mutationObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      // console.log("MutationObserver:", mutation.target, mutation.oldValue);
      if (_recordMutations) {
        _domChanges.push({mutation: mutation, el: mutation.target, val: mutation.oldValue});
      }
    });
  });
  // configuration of the observer:
  var _mutationObserverConfig = { subtree: true, characterData: true, characterDataOldValue: true };

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
    el.removeEventListener("keydown", _onKeyDown);
    el.removeEventListener("textInput", _onTextInput, true);
    el.removeEventListener("input", _onTextInput, true);
    $el.off("mouseup", _onMouseup);
    _mutationObserver.disconnect();
    keyboard.disconnect(el);
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

  // HACK: up to now this is the only way I figured out to recognize if an observed DOM manipulation
  // originated from a Substance.Document update or from an multi-char input.
  this.manipulate = function(f, propagate) {
    return function(e) {
      _recordMutations = false;
      setTimeout(f, 0);
      if(!propagate) e.preventDefault();
    };
  };


  // Key-bindings
  // --------

  keyboard.bind("selection", function() {
    self.onCursorMoved();
  }, "keydown");

  // Note: these stupid 'surface.manipulate' stuff is currently necessary
  // as I could not find another way to distinguish the cases for regular text input
  // and multi-char input. It would not be necessary, if we had a robust way
  // to recognize native key events for that complex chars...
  // However, for now that dirt... we can this streamline in future - for sure...

  keyboard.bindMapped("backspace", self.manipulate(function() {
    editorCtrl.delete("left");
  }), "keydown");

  keyboard.bindMapped("delete", self.manipulate(function() {
    editorCtrl.delete("right");
  }), "keydown");

  keyboard.bindMapped("break", self.manipulate(function() {
    editorCtrl.breakNode();
  }), "keydown");

  keyboard.bindMapped("soft-break", self.manipulate(function() {
    editorCtrl.write("\n");
  }), "keydown");

  keyboard.bindMapped("blank", self.manipulate(function() {
    editorCtrl.write(" ");
  }), "keydown");

  keyboard.bindMapped("indent", self.manipulate(function() {
    editorCtrl.indent("right");
  }), "keydown");

  keyboard.bindMapped("unindent", self.manipulate(function() {
    editorCtrl.indent("left");
  }), "keydown");

  keyboard.bindMapped("undo", self.manipulate(function() {
    editorCtrl.undo();
  }), "keydown");

  keyboard.bindMapped("redo", self.manipulate(function() {
    editorCtrl.redo();
  }), "keydown");

  keyboard.bindMapped("strong", self.manipulate(function() {
    editorCtrl.annotate("strong");
  }), "keydown");

  keyboard.bindMapped("emphasis", self.manipulate(function() {
    editorCtrl.annotate("emphasis");
  }), "keydown");

  // EXPERIMENTAL hooks for creating new node and annotation types

  keyboard.bindMapped("heading", self.manipulate(function() {
    editorCtrl.insertNode("heading", {"level": 1});
  }), "keydown");

  // HACK: even if we do not implement copy'n'paste here, we need to disable
  // the DOM Mutation observer stuff temporarily
  keyboard.bindMapped("paste", function(e) {
    _recordMutations = false;
  }, "keypress");


  // Initialization
  // --------

  var _initialize = function() {
    self.listenTo(editorCtrl.session.selection,  "selection:changed", onSelectionChanged);
    el.addEventListener("keydown", _onKeyDown);
    el.addEventListener("textInput", _onTextInput, true);
    el.addEventListener("input", _onTextInput, true);
    $el.mouseup(_onMouseup);
    _mutationObserver.observe(el, _mutationObserverConfig);
    keyboard.connect(el);
  };

  _initialize();
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
