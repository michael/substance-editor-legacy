"use strict";

var Surface = require("substance-surface");
var Keyboard = require("substance-commander").ChromeKeyboard;
var MutationObserver = window.MutationObserver;

var MutationObserver;

if (!window.MutationObserver) {
  if (window.WebKitMutationObserver) {
    MutationObserver = window.WebKitMutationObserver;
  }
} else {
  MutationObserver = window.MutationObserver;
}

// The BasicEditor is an editable Surface
// --------
// Don't look too close at this code. It is ugly. Yes. It is.

var __id__ = 0;

var BasicEditor = function(docCtrl, renderer, options) {
  Surface.call(this, docCtrl, renderer);

  this.__id__ = __id__++;

  options = options || {};
  var keymap = options.keymap || BasicEditor._getDefaultKeyMap();
  this.keyboard = new Keyboard(keymap);
  this.editorCtrl = docCtrl;
  this.el.spellcheck = false;

  // to be able to handle deadkeys correctly we need a DOMMutationObserver
  // that allows us to revert DOM pollution done by contenteditable.
  // It is not possible to implement deadkey ourselves. When we stop propagation of keypress
  // for deadkeys we do not receive text input or even a keyup
  // (which would contain the actual keycode of the deadkey)
  this._domChanges = [];
  this._hasDeadKey = false;

  this._initEditor();
  this.activate();
};

BasicEditor.Prototype = function() {

  // Override the dispose method to bind extra disposing stuff
  // --------
  // TODO: we should really consider to make this an independet class instead of a mix-in
  // and let the surface call the dispose explicitely

  var __dispose__ = this.dispose;
  this.dispose = function() {
    __dispose__.call(this);
    this.deactivate();
  };

  this.revertDOMChanges = function() {
    // console.log("Reverting DOM changes...", this._domChanges);
    var change = this._domChanges[0];
    change.el.textContent = change.oldValue;
    this._domChanges = [];
  };

  this.onTextInput = function(e) {
    var self = this;

    //console.log("BasicEditor onTextInput", e);
    var text = e.data;

    if (!e.data && self._hasDeadKey) {
      // skip
      // console.log("skipping _hasDeadKey", e, self._domChanges);
      return;
    }

    else if (e.data) {
      if (self._hasDeadKey) {
        // console.log("(", self.__id__, ") Handling deadkey", self._domChanges);
        self._hasDeadKey = false;
        self.revertDOMChanges();
        self.renderSelection();
      }

      // console.log("(", self.__id__, ") TextInput", text);
      // NOTE: this timeout brought problems with handling
      // deadkeys together with other cancelling input (e.g., backspace, return)
      // window.setTimeout(function() {
        try {
          self.updateSelection();
          self.editorCtrl.write(text);
        } catch (err) {
          self.editorCtrl.trigger("error", err);
        }
        // make sure there are no dom changes from this manipulation
        self._domChanges = [];
      // }, 0);
    }

    self._domChanges = [];
    e.preventDefault();
    e.stopPropagation();
  };


  this._initEditor = function() {
    var self = this;
    var keyboard = this.keyboard;
    var editorCtrl = this.editorCtrl;

    this._onModelSelectionChanged = this.onModelSelectionChanged.bind(this);
    this._onTextInput = this.onTextInput.bind(this);

    var _manipulate = function(action) {
      return function(e) {
        try {
          action.call(self, e);
        } catch (err) {
          console.log("BasicEditor: triggering error", err);
          editorCtrl.trigger("error", err);
        }
        e.preventDefault();
        e.stopPropagation();
      };
    };

    // Key-bindings
    // --------

    // they are handled on a higher level
    keyboard.pass("copy");
    keyboard.pass("cut");
    keyboard.pass("paste");

    keyboard.bind("nop", "keydown", function(e) {
      e.preventDefault();
      e.stopPropagation();
    });

    // Note: these stupid 'surface.manipulate' stuff is currently necessary
    // as I could not find another way to distinguish the cases for regular text input
    // and multi-char input. It would not be necessary, if we had a robust way
    // to recognize native key events for that complex chars...
    // However, for now that dirt... we can this streamline in future - for sure...

    keyboard.bind("backspace", "keydown", _manipulate(function() {
      editorCtrl.delete("left");
    }));

    keyboard.bind("delete", "keydown", _manipulate(function() {
      editorCtrl.delete("right");
    }));

    keyboard.bind("break", "keydown", _manipulate(function() {
      editorCtrl.breakNode();
    }));

    keyboard.bind("soft-break", "keydown", _manipulate(function() {
      editorCtrl.write("\n");
    }));

    keyboard.bind("blank", "keydown", _manipulate(function() {
      editorCtrl.write(" ");
    }));

    keyboard.bind("indent", "keydown", _manipulate(function() {
      editorCtrl.indent("right");
    }));

    keyboard.bind("unindent", "keydown", _manipulate(function() {
      editorCtrl.indent("left");
    }));

    keyboard.bind("undo", "keydown", _manipulate(function() {
      editorCtrl.undo();
    }));

    keyboard.bind("redo", "keydown", _manipulate(function() {
      editorCtrl.redo();
    }));

    keyboard.bind("select-all", "keydown", _manipulate(function() {
      editorCtrl.select("all");
    }));

    keyboard.bind("strong", "keydown", _manipulate(function() {
      editorCtrl.toggleAnnotation("strong");
    }));

    keyboard.bind("emphasis", "keydown", _manipulate(function() {
      editorCtrl.toggleAnnotation("emphasis");
    }));

    keyboard.bind("text", "keydown", _manipulate(function() {
      editorCtrl.changeType("text");
    }));

    keyboard.bind("heading", "keydown", _manipulate(function() {
      editorCtrl.changeType("heading", {"level": 1});
    }));

    keyboard.bind("code_block", "keydown", _manipulate(function() {
      editorCtrl.changeType("code_block");
    }));

    keyboard.bind("list", "keydown", _manipulate(function() {
      editorCtrl.changeType("list_item", {"level": 1});
    }));

    keyboard.setDefaultHandler("keypress", function(e) {
      // console.log("BasicEditor keypress", e, keyboard.describeEvent(e));
      editorCtrl.write(String.fromCharCode(e.which));
      e.preventDefault();
      e.stopPropagation();
    });

    keyboard.setDefaultHandler("keyup", function(e) {
      // console.log("BasicEditor keyup", e, keyboard.describeEvent(e));
      e.preventDefault();
      e.stopPropagation();
      self._domChanges = [];
    });

    keyboard.bind("special", "keydown", function(e) {
      // Note: this gets called twice: once for the deadkey and a second time
      // for the associated character
      if (!self._hasDeadKey) {
        // console.log("...special", e);
        self._hasDeadKey = true;
        self._domChanges = [];
      }
    });

    this._mutationObserver = new MutationObserver(function(mutations) {
      if (!self._hasDeadKey) {
        return;
      }
      mutations.forEach(function(mutation) {
        var entry = {
          mutation: mutation,
          el: mutation.target,
          value: mutation.target.textContent,
          oldValue: mutation.oldValue
        };
        // console.log("Recording mutation:", entry);
        self._domChanges.push(entry);
      });
    });

  };

  // Updates the window selection whenever the model selection changes
  // --------
  // TODO: we should think about how this could be optimized.
  // ATM, a window selection change, e.g., when moving the cursor,
  // triggers a model selection update, which in turn triggers a window selection update.
  // The latter would not be necessary in most cases.
  this.onModelSelectionChanged = function(range, options) {
    // Note: this method implements a try-catch guard triggering an error event
    this.renderSelection(range, options);
  };

  // Initialization
  // --------

  this.activate = function() {
    var el = this.el;
    this.editorCtrl.session.selection.on("selection:changed", this._onModelSelectionChanged);
    el.addEventListener("textInput", this._onTextInput, true);
    el.addEventListener("input", this._onTextInput, true);
    var _mutationObserverConfig = { subtree: true, characterData: true, characterDataOldValue: true };
    this._mutationObserver.observe(el, _mutationObserverConfig);
    this.keyboard.connect(el);
    el.setAttribute("contenteditable", "true");
  };

  this.deactivate = function() {
    var el = this.el;
    this.editorCtrl.session.selection.off("selection:changed", this._onModelSelectionChanged);
    el.removeEventListener("textInput", this._onTextInput, true);
    el.removeEventListener("input", this._onTextInput, true);
    this._mutationObserver.disconnect();
    this.keyboard.disconnect();
    el.setAttribute("contenteditable", "true");
  };

};

BasicEditor.Prototype.prototype = Surface.prototype;
BasicEditor.prototype = new BasicEditor.Prototype();

BasicEditor._getDefaultKeyMap = function() {
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

module.exports = BasicEditor;
