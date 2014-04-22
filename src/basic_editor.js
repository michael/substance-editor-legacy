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

var BasicEditor = function(docCtrl, renderer, options) {
  Surface.call(this, docCtrl, renderer);

  options = options || {};
  var keymap = options.keymap || BasicEditor._getDefaultKeyMap();
  this.keyboard = new Keyboard(keymap);
  this.editorCtrl = docCtrl;
  this.el.spellcheck = false;

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

  // computes a trivial diff based on the assumption that only one character has been inserted
  var inserted_character = function(val, oldVal) {
    var pos;
    for (pos = 0; pos < oldVal.length; pos++) {
      if (oldVal[pos] !== val[pos]) break;
    }
    return val[pos];
  };

  this.onTextInput = function(e) {
    var self = this;

    //console.log("BasicEditor onTextInput", e);
    var text = e.data;

    if (!e.data && self._hasDeadKey) {
      // skip
      // console.log("_hasDeadKey", e, self._domChanges);
      return;
    }

    else if (e.data) {
      if (self._hasDeadKey) {
        self._hasDeadKey = false;
        // console.log("#####", self._domChanges);
        var change = self._domChanges[self._domChanges.length-1];
        change.el.textContent = change.oldValue;
        self.renderSelection();
        self._domChanges = [];
      }

      window.setTimeout(function() {
        try {
          self.updateSelection();
          self.editorCtrl.write(text);
        } catch (err) {
          self.editorCtrl.trigger("error", err);
        }
        self._domChanges = [];
      }, 0);
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

    // HACK: to be able to handler deadkeys correctly we need still a DOMMutationObserver
    // A contenteditable suppresses keydown events for deadkeys.
    // This would be only way to prevent the browser from changing the DOM.
    // Thus, we need to revert changes done by the model...
    // Ideally, the browser could be prevented from changing the DOM. However, this is just under discussion with Robin Berjon from W§C.
    // Another solution would be to suppress updates. This would need an adaption
    // to operations allowing to have volatile data for application purpose. (not so easy to achieve)
    this._domChanges = [];


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

    if (window.navigator.platform.toLowerCase().search("win32") >= 0 ||
        window.navigator.platform.toLowerCase().search("linux") >= 0 ||
        (typeof process !== "undefined" && process.platform !== 'darwin')) {
    } else {
      keyboard.bind("special", "keydown", function(e) {
        // console.log("...special", e);
        self._hasDeadKey = true;
      });
    }

    keyboard.setDefaultHandler("keydown", function(e) {
      //console.log("BasicEditor keydown", e, keyboard.describeEvent(e));
      // TODO: detect all multi-char inputs, and remember that information
      // to augment the next keypressed character

      // NOTE: very strange: OSX has 192 of '°', Windows for 'ö'
      // if (e.keyCode === 192) {
      //   console.log("Welcome to keycode hell", e);
      // }

      if (e.keyCode === 229) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    this._mutationObserver = new MutationObserver(function(mutations) {
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