"use strict";

var _ = require("underscore");
var util = require("substance-util");

// The container must be much more view oriented as the actual visualized components depend very much on the
// used renderers.

var Container = function(document, name, renderer) {
  this.document = document;
  this.name = name;

  var container = this.document.get(name);
  if (!container || container.type !== "view") {
    throw new Error("Illegal argument: no view with name " + name);
  }

  this.view = container;
  this.__components = null;
  this.__roots = null;

  this.renderer = renderer;
  this.rebuild();
};

Container.Prototype = function() {

  this.rebuild = function() {
    var __components = [];
    var __roots = [];
    var view = this.document.get(this.name);

    if (!this.renderer) return;

    var rootNodes = view.nodes;

    for (var i = 0; i < rootNodes.length; i++) {
      var id = rootNodes[i];
      var nodeView = this.renderer.getView(id);
      if (!nodeView) {
        throw new Error("Aaaaah! no view available for " + id);
      }
      var components = nodeView.getViewComponents();
      for (var j = 0; j < components.length; j++) {
        __components.push(components[j]);
        __roots.push(rootNodes[i]);
      }
    }

    this.__components = __components;
    this.__roots = __roots;
    this.view = view;
  };

  this.lookup = function(path) {
    for (var i = 0; i < this.__components.length; i++) {
      var component = this.__components[i];
      if (_.isEqual(component.path, path)) {
        component.pos = i;
        return component;
      }
    }

    throw new Error("Could not find a view component for path " + JSON.stringify(path));
  };

  this.getNodes = function(idsOnly) {
    var nodeIds = this.view.nodes;
    if (idsOnly) {
      return _.clone(nodeIds);
    }
    else {
      var result = [];
      for (var i = 0; i < nodeIds.length; i++) {
        result.push(this.document.get(nodeIds[i]));
      }
      return result;
    }
  };

  this.update = function(op) {
    var path = op.path;
    var needRebuild = (path[0] === this.view.id ||  this.__composites[path[0]] !== undefined);
    if (needRebuild) this.rebuild();
  };

  this.getLength = function(pos) {
    if (pos === undefined) {
      return this.__components.length;
    } else {
      return this.__components[pos].getLength();
    }
  };

  this.lookupRootNode = function(nodeId) {
    for (var i = 0; i < this.__components.length; i++) {
      var component = this.__components[i];
      switch(component.type) {
      case "node":
        if (component.node.id === nodeId) return this.__roots[i];
        break;
      case "property":
        // TODO: I am not sure here.
        if (component.path[0] === nodeId) return this.__roots[i];
        break;
      default:
        throw new Error("Not implemented.");
      }
    }

    throw new Error("Could not fina a root node for the given id:" + nodeId);
  };

  this.getElement = function(pos) {
    return this.__components[pos];
  };

  this.getTopLevelNodes = function() {
    throw new Error("This has been removed. Use getNodes() instead.");
  };
  this.getPosition = function() {
    throw new Error("This has been removed.");
  };
  this.getNodeFromPosition = function() {
    throw new Error("This has been removed.");
  };
  this.getParent = function() {
    throw new Error("This has been removed. Fix me.");
  };
  this.getRoot = function() {
    throw new Error("This has been removed. Fix me.");
  };
  this.hasSuccessor = function() {
    throw new Error("This has been removed. Fix me.");
  };
  this.hasPredecessor = function() {
    throw new Error("This has been removed. Fix me.");
  };
  this.getPredecessor = function() {
    throw new Error("This has been removed. Fix me.");
  };
  this.getSuccessor = function() {
    throw new Error("This has been removed. Fix me.");
  };
  this.firstChild = function() {
    throw new Error("This has been removed. Fix me.");
  };
  this.lastChild = function() {
    throw new Error("This has been removed. Fix me.");
  };
  this.before = function() {
    throw new Error("This has been removed. Fix me.");
  };
  this.after = function() {
    throw new Error("This has been removed. Fix me.");
  };
};

Container.prototype = _.extend(new Container.Prototype(), util.Events.Listener);

Object.defineProperties(Container.prototype, {
  "id": {
    get: function() { return this.view.id; }
  },
  "type": {
    get: function() { return this.view.type; }
  },
  "nodes": {
    get: function() { return this.view.nodes; },
    set: function(val) { this.view.nodes = val; }
  },
  "treeView": {
    get: function() { throw new Error("This has been removed. Fix me."); },
  },
  "listView": {
    get: function() { throw new Error("This has been removed. Fix me."); },
  },
});

module.exports = Container;
