"use strict";

// A clipboard implementation for the Surface
//

var Clipboard = function(el) {
  this.el = el;
  el.onpaste = this.onpaste.bind(this);
};

Clipboard.Prototype = function() {

  this.onpaste = function() {
    // Note: http://jsfiddle.net/bQeWC/4/ shows how to implement
    // a paste handler using bare metal methods
    // However, I think it would be possible to implement this more
    // elegantly using MutationObserver (of course loosing browser compatibility)
    debugger;

    // schedule post-paste processing
    window.setTimeout(function() {
      console.log("Post processing paste.");
    }, 1);
  };

};
Clipboard.prototype = new Clipboard.Prototype();

module.exports = Clipboard;
