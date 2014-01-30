"use strict";

var util = require("substance-util");
var Operator = require('substance-operator');
var ObjectOperation = Operator.ObjectOperation;
var ArrayOperation = Operator.ArrayOperation;

// Simple Editor for the Content view
// --------
//

var SimpleViewEditor = function(factory) {
  this.factory = factory;
  this.view = "content";
};

SimpleViewEditor.Prototype = function() {

  this.canInsertNode = function(session, node, nodePos) {
    return true;
  };

  this.insertNode = function(session, node, nodePos) {
    session.document.show(this.view, node.id, nodePos);
  };

  this.canDeleteNode = function(session, node, nodePos) {
    return (nodePos >= 0 && nodePos < this._length(session));
  };

  this.deleteNode = function(session, node, nodePos) {
    var diffOp = ArrayOperation.Delete(nodePos, node.id);
    session.document.apply(ObjectOperation.Update([this.view, "nodes"], diffOp));

    // We have to ensure that the document contains at least one text node
    // otherwise editing would not be possible anymore
    if (this._length(session) === 1) {
      var textNode = {
        type: "text",
        id: "text_"+util.uuid(),
        content: ""
      };
      session.document.create(textNode);
      session.document.show(this.view, textNode.id);
    }
  };

  this._length = function(session) {
    return session.document.nodes[this.view].nodes.length;
  };

  this._nodeId = function(session, pos) {
    return session.document.nodes[this.view].nodes[pos];
  };

};

SimpleViewEditor.prototype = new SimpleViewEditor.Prototype();

module.exports = SimpleViewEditor;

