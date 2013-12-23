"use strict";

var _ = require("underscore");
var View = require("substance-application").View;
var util = require("substance-util");
var Keyboard = require("./surface_keyboard");

// Substance.Surface
// ==========================================================================

var Surface = function(docCtrl, renderer) {
  View.call(this);

  this.docCtrl = docCtrl;
  this.renderer = renderer;

  // Pull out the registered nodetypes on the written article
  this.nodeTypes = docCtrl.document.nodeTypes;
  this.nodeViews = this.renderer.nodeViews;

  this.$el.addClass('surface');

  this.listenTo(this.docCtrl.document, "property:updated", this.onUpdateView);
  this.listenTo(this.docCtrl.document, "graph:reset", this.reset);

  if (docCtrl.isEditor()) {
    Surface.addEditingBehavior(this, new Keyboard(docCtrl));
  }
};


Surface.Prototype = function() {

  // Private helpers
  // ---------------

  var _extractPath = function(el) {
    var path = [];
    var current = el;
    while(current !== undefined) {

      // node-views
      if ($(current).is(".content-node")) {
        var id = current.getAttribute("id");
        if (!id) {
          throw new Error("Every element with class 'content-node' must have an 'id' attribute.");
        }
        path.unshift(id);

        // STOP here
        return path;
      }
      else if (current.getAttribute) {
        // if there is a path attibute we collect it
        var p = current.getAttribute("data-path");
        if (p) path.unshift(p);
      }

      current = current.parentElement;
    }

    return null;
  };

  var _mapDOMCoordinates = function(el, offset) {
    var nodePos, charPos;

    var container = this.docCtrl.container;

    // extract a path by looking for ".content-node" and ".node-property"
    var elementPath = _extractPath(el);

    if (!elementPath) {
      throw new Error("Could not find node.");
    }

    // get the position from the container
    var component = container.lookup(elementPath);
    if (!component) return null;

    // TODO rethink when it is a good time to attach the view to the node surface
    if (!component.surface.hasView()) {
      var view = this.nodeViews[component.node.id];
      component.surface.attachView(view);
    }

    nodePos = component.pos;
    charPos = component.surface.getCharPosition(el, offset);

    return [nodePos, charPos];
  };

  // Read out current DOM selection and update selection in the model
  // ---------------

  this.updateSelection = function(/*e*/) {
    var wSel = window.getSelection();

    // HACK: sometimes it happens that the selection anchor node is undefined.
    // Try to understand and fix someday.
    if (wSel.anchorNode === null) {
      console.error("Ooops. Please try to fix this.");
      return;
    }

    // Set selection to the cursor if clicked on the cursor.
    if ($(wSel.anchorNode.parentElement).is(".cursor")) {
      this.docCtrl.selection.collapse("cursor");
      return;
    }

    var wRange = wSel.getRangeAt(0);
    var wStartPos;
    var wEndPos;

    // Note: there are three different cases:
    // 1. selection started at startContainer (regular)
    // 2. selection started at endContainer (reverse)
    // 3. selection done via double click (anchor in different to range boundaries)
    // In cases 1. + 3. the range is used as given, in case 2. reversed.

    wStartPos = [wRange.startContainer, wRange.startOffset];
    wEndPos = [wRange.endContainer, wRange.endOffset];

    if (wRange.endContainer === wSel.anchorNode && wRange.endOffset === wSel.anchorOffset) {
      var tmp = wStartPos;
      wStartPos = wEndPos;
      wEndPos = tmp;
    }

    var startPos = _mapDOMCoordinates.call(this, wStartPos[0], wStartPos[1]);
    if (!startPos) return;

    var endPos;
    if (wRange.collapsed) {
      endPos = startPos;
    } else {
      endPos = _mapDOMCoordinates.call(this, wEndPos[0], wEndPos[1]);
      if (!endPos) return;
    }

    // console.log("Surface.updateSelection()", startPos, endPos);
    this.docCtrl.selection.set({start: startPos, end: endPos});
  };


  // Renders the current selection
  // --------
  //

  var _mapModelCoordinates = function(pos) {
    var container = this.docCtrl.container;
    var component = container.getComponent(pos[0]);
    // TODO rethink when it is a good time to attach the view to the node surface
    if (!component.surface.hasView()) {
      var view = this.nodeViews[component.node.id];
      component.surface.attachView(view);
    }
    var wCoor = component.surface.getDOMPosition(pos[1]);
    return wCoor;
  };

  this.renderSelection = function() {
    var sel = this.docCtrl.selection;

    var wSel = window.getSelection();
    var range = sel.range();

    var wRange = document.createRange();

    var wStartPos = _mapModelCoordinates.call(this, range.start);
    wRange.setStart(wStartPos.startContainer, wStartPos.startOffset);

    if (!sel.isCollapsed()) {
      var wEndPos = _mapModelCoordinates.call(this, range.end);
      wRange.setEnd(wEndPos.endContainer, wEndPos.endOffset);
    }

    wSel.removeAllRanges();
    wSel.addRange(wRange);
  };

  // Render it
  // --------
  //
  // input.image-files
  // .controls
  // .nodes
  //   .content-node.paragraph
  //   .content-node.heading
  //   ...
  // .cursor

  this.render = function() {

    var fileInput = document.createElement('input');
    fileInput.className = "image-files";
    fileInput.setAttribute("type", "file");

    fileInput.setAttribute("name", "files[]");

    var controls = document.createElement('div');
    controls.className = "controls";
    var nodes = document.createElement('div');
    nodes.className = "nodes";

    var cursor = document.createElement('div');
    cursor.className = "cursor";

    this.el.appendChild(fileInput);
    this.el.appendChild(controls);
    this.el.appendChild(nodes);
    this.el.appendChild(cursor);

    // Actual content goes here
    // --------
    //
    // We get back a document fragment from the renderer

    nodes.appendChild(this.renderer.render());

    // TODO: fixme
    this.$('input.image-files').hide();
    this.$cursor = this.$('.cursor');
    this.$cursor.hide();

    // keep the nodes for later access
    this._nodesEl = nodes;

    return this;
  };

  this.reset = function() {
    _.each(this.nodeViews, function(nodeView) {
      nodeView.dispose();
    });
    this.render();
  };

  // Cleanup view before removing it
  // --------
  //

  this.dispose = function() {
    this.stopListening();
    _.each(this.nodeViews, function(n) {
      n.dispose();
    }, this);
  };

  // HACK: used by outline
  // TODO: meditate on the Surface's API
  this.getContainer = function() {
    return this.docCtrl.container;
  };

  // TODO: we could factor this out into something like a ContainerView?

  function insertOrAppend(container, pos, el) {
    var childs = container.childNodes;
    if (pos < childs.length) {
      var refNode = childs[pos];
      container.insertBefore(el, refNode);
    } else {
      container.appendChild(el);
    }
  }

  this.onUpdateView = function(path, diff) {
    if (path.length !== 2 || path[0] !== this.docCtrl.view || path[1] !== "nodes") return;

    var nodeId, node;
    var container = this._nodesEl;

    var children, el;

    if (diff.isInsert()) {
      // Create a view and insert render it into the nodes container element.
      nodeId = diff.val;
      node = this.docCtrl.document.get(nodeId);
      // TODO: this will hopefully be solved in a clean way
      // when we have done the 'renderer' refactorings
      if (this.nodeTypes[node.type]) {
        var nodeView = this.renderer.createView(node);
        this.nodeViews[nodeId] = nodeView;
        el = nodeView.render().el;
        insertOrAppend(container, diff.pos, el);
      }
    }
    else if (diff.isDelete()) {
      // Dispose the view and remove its element from the nodes container
      nodeId = diff.val;
      if (this.nodeViews[nodeId]) {
        this.nodeViews[nodeId].dispose();
      }
      delete this.nodeViews[nodeId];
      children = container.children;
      container.removeChild(children[diff.pos]);
    }
    else if (diff.isMove()) {
      children = container.children;
      el = children[diff.pos];
      container.removeChild(el);
      insertOrAppend(container, diff.target, el);
    } else if (diff.type === "NOP") {
    } else {
      throw new Error("Illegal state.");
    }
  };

};

_.extend(Surface.Prototype, util.Events.Listener);

Surface.Prototype.prototype = View.prototype;
Surface.prototype = new Surface.Prototype();

module.exports = Surface;
