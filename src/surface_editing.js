
// Makes a Surface editable
// --------
// We extracted all the ugly code dealing with keyboard and mouse events
// which is in first place ugly and secondly too. Thirdly, it is still rather experimental.

var addEditingBehavior = function(surface, keyboard) {

  var self = this;
  var el = surface.el;
  var $el = surface.$el;
  var docCtrl = surface.docCtrl;

  el.setAttribute("contenteditable", "true");
  el.spellcheck = false;

  // Support for Multi-Char inputs
  // --------

  var _dirt = [];
  var _dirtPossible = false;
  var _ignoreNextSelection = false;

  var _onMouseup = function(e) {
    _ignoreNextSelection = true;
    surface.updateSelection(e);
  };

  var _onKeyDown = function() {
    _dirtPossible = true;
  };

  var _onTextInput = function(e) {
    _dirtPossible = false;
    while (_dirt.length > 0) {
      var dirt = _dirt.shift();
      dirt[0].textContent = dirt[1];
    }
    docCtrl.write(e.data);
    e.preventDefault();
  };

  var _mutationObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (_dirtPossible) {
        _dirt.push([mutation.target, mutation.oldValue]);
      }
    });
  });
  // configuration of the observer:
  var _mutationObserverConfig = { subtree: true, characterData: true, characterDataOldValue: true };

  // Hack to avoid circular updates of the selection
  // --------

  var onSelectionChanged = function() {
    if (_ignoreNextSelection === true) {
      _ignoreNextSelection = false;
      return;
    }
    return surface.renderSelection.apply(surface, arguments);
  };

  // Initialization
  // --------

  var _initialize = function() {
    surface.listenTo(surface.docCtrl.selection,  "selection:changed", onSelectionChanged);
    el.addEventListener("keydown", _onKeyDown);
    el.addEventListener("textInput", _onTextInput, true);
    el.addEventListener("input", _onTextInput, true);
    $el.mouseup(_onMouseup);
    _mutationObserver.observe(el, _mutationObserverConfig);
    keyboard.connect(surface);
  };

  // Override the dispose method
  // --------

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
      _ignoreNextSelection = true;
      surface.updateSelection();
    }, 0);
  };

  // HACK: up to now this is the only way I figured out to recognize if an observed DOM manipulation
  // originated from a Substance.Document update or from an multi-char input.
  // In the latter case we eliminate
  surface.manipulate = function(f) {
    return function(e) {
      _dirtPossible = false;
      setTimeout(f, 0);
      e.preventDefault();
    };
  };

  _initialize();
};

module.exports = addEditingBehavior;

