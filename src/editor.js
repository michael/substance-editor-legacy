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

// The Editor is an editable Surface
// --------
// Don't look too close at this code. It is ugly. Yes. It is.

var Editor = function(docCtrl, renderer, options) {
  Surface.call(this, docCtrl, renderer);

  options = options || {};
  var keymap = options.keymap || Editor._getDefaultKeyMap();
  this.keyboard = new Keyboard(keymap);
  this.editorCtrl = docCtrl;
  this.el.spellcheck = false;

  this._initEditor();
  this.activate();
};

Editor.Prototype = function() {

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

    //console.log("Editor onTextInput", e);
    var text = e.data;

    if (!text && this._domChanges.length > 0) {
      var change = this._domChanges[0];
      var diffLength = change.value.length - change.oldValue.length;
      if (diffLength !== 1) {
        console.error("ASSERT: this code assumes that there is a difference of one character.");
        return;
      }
      text = inserted_character(change.value, change.oldValue);

      // HACK: the contenteditable when showing the character selection popup
      // will change the selection to the previously inserted char... magically
      // We transfer the selection to the model and then write the text input.
      window.setTimeout(function() {
        try {
          // reset the element to the change before the DOM polution
          change.el.textContent = change.oldValue;
          self.editorCtrl.write(text);
        } catch (err) {
          self.editorCtrl.trigger("error", err);
        }
      }, 0);
    }

    else if (e.data) {
      window.setTimeout(function() {
        try {
          self.updateSelection();
          self.editorCtrl.write(text);
        } catch (err) {
          self.editorCtrl.trigger("error", err);
        }
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
          console.log("Editor: triggering error", err);
          editorCtrl.trigger("error", err);
        }
        e.preventDefault();
        e.stopPropagation();
      };
    };

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

    // they are handled on a higher level
    keyboard.pass("copy");
    keyboard.pass("cut");
    keyboard.pass("paste");

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

    keyboard.bind("codeblock", "keydown", _manipulate(function() {
      editorCtrl.changeType("codeblock");
    }));

    keyboard.bind("list", "keydown", _manipulate(function() {
      editorCtrl.changeType("list_item", {"level": 1});
    }));

    keyboard.setDefaultHandler("keypress", _manipulate(function(e) {
      //console.log("Editor keypress", e, keyboard.describeEvent(e));
      editorCtrl.write(String.fromCharCode(e.which));
    }));

    keyboard.setDefaultHandler("keyup", function(e) {
      //console.log("Editor keyup", e, keyboard.describeEvent(e));
      e.preventDefault();
      e.stopPropagation();
      _domChanges = [];
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
  this.onModelSelectionChanged = function() {
    // Note: this method implements a try-catch guard triggering an error event
    this.renderSelection.apply(this, arguments);
  };

  // Initialization
  // --------

  this.activate = function() {
    var el = this.el;
    this.editorCtrl.session.selection.on("selection:changed", this._onModelSelectionChanged);
    el.addEventListener("textInput", this.onTextInput, true);
    el.addEventListener("input", this.onTextInput, true);
    var _mutationObserverConfig = { subtree: true, characterData: true, characterDataOldValue: true };
    this._mutationObserver.observe(el, _mutationObserverConfig);
    this.keyboard.connect(el);
    el.setAttribute("contenteditable", "true");
  };

  this.deactivate = function() {
    var el = this.el;
    this.editorCtrl.session.selection.off("selection:changed", this._onModelSelectionChanged);
    el.removeEventListener("textInput", this.onTextInput, true);
    el.removeEventListener("input", this.onTextInput, true);
    this._mutationObserver.disconnect();
    this.keyboard.disconnect();
    el.setAttribute("contenteditable", "true");
  };

};

Editor.Prototype.prototype = Surface.prototype;
Editor.prototype = new Editor.Prototype();

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

module.exports = Editor;
