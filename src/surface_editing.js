"use strict";

// Makes a Surface editable
// --------
// We extracted all the ugly code dealing with keyboard and mouse events
// which is in first place ugly and secondly too. Thirdly, it is still rather experimental.

var addEditingBehavior = function(surface, keyboard) {

  var el = surface.el;
  var $el = surface.$el;
  var editorCtrl = surface.docCtrl;

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
    surface.updateSelection(e);
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
    return surface.renderSelection.apply(surface, arguments);
  };

  // HACK: even if we do not implement copy'n'paste here, we need to disable
  // the DOM Mutation observer stuff temporarily
  keyboard.bind("paste", function(e) {
    _recordMutations = false;
  }, "keypress");

  // Override the dispose method to bind extra disposing stuff
  // --------
  // TODO: we should really consider to make this an independet class instead of a mix-in
  // and let the surface call the dispose explicitely

  var __dispose__ = surface.dispose;
  surface.dispose = function() {
    __dispose__.call(surface);
    el.removeEventListener("keydown", _onKeyDown);
    el.removeEventListener("textInput", _onTextInput, true);
    el.removeEventListener("input", _onTextInput, true);
    $el.off("mouseup", _onMouseup);
    _mutationObserver.disconnect();
    keyboard.disconnect();
  };

  // API for handling keyboard input
  // --------
  // Note: it is necessary to react in a delayed fashion using setTimeout
  // as the ContentEditable updates its content after the handler has been invoked

  surface.onCursorMoved = function() {
    // call this after the movement has been done by the contenteditable
    setTimeout(function() {
      // _ignoreNextSelection = true;
      surface.updateSelection();
    }, 0);
  };

  // HACK: up to now this is the only way I figured out to recognize if an observed DOM manipulation
  // originated from a Substance.Document update or from an multi-char input.
  surface.manipulate = function(f, propagate) {
    return function(e) {
      _recordMutations = false;
      setTimeout(f, 0);
      if(!propagate) e.preventDefault();
    };
  };

  // Initialization
  // --------

  var _initialize = function() {
    surface.listenTo(editorCtrl.session.selection,  "selection:changed", onSelectionChanged);
    el.addEventListener("keydown", _onKeyDown);
    el.addEventListener("textInput", _onTextInput, true);
    el.addEventListener("input", _onTextInput, true);
    $el.mouseup(_onMouseup);
    _mutationObserver.observe(el, _mutationObserverConfig);
    keyboard.connect(surface);
  };

  _initialize();
};

module.exports = addEditingBehavior;
