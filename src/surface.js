"use strict";

var _ = require("underscore");
var View = require("substance-application").View;
var util = require("substance-util");

// Substance.Surface
// ==========================================================================

var Surface = function(docCtrl, options) {
  View.call(this);

  var that = this;

  options = _.extend({
    editable: true
  }, options);
  this.options = options;

  if (this.options.renderer) {
    this.renderer = this.options.renderer;
  } else {
    this.renderer = new docCtrl.__document.constructor.Renderer(doc);
  }

  this.docCtrl = docCtrl;

  // Pull out the registered nodetypes on the written article
  this.nodeTypes = docCtrl.__document.nodeTypes;
  this.nodes = this.renderer.nodes;

  this.$el.addClass('surface');

  // Shouldn't this be done outside?
  this.$el.addClass(this.docCtrl.view);

  this.listenTo(this.docCtrl.__document, "property:updated", this.onUpdateView);
  this.listenTo(this.docCtrl.__document, "graph:reset", this.reset);
};


Surface.Prototype = function() {

  // Private helpers
  // ---------------
  var _findNodeElement = function(node) {
    var current = node;
    while(current !== undefined) {
      if ($(current).is(".content-node")) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  };

  // Read out current DOM selection and update selection in the model
  // ---------------

  this.updateSelection = function(/*e*/) {
    // console.log("Surface.updateSelection()");
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

    // Preparing information for EOL-HACK (see below).
    // The hack only needs to be applied of the mouse event is in a different 'line'
    // than the DOM Range provided by the browser
    //Surface.Hacks.prepareEndOfLineHack.call(this, e, wRange);

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

    var startNode = _findNodeElement.call(this, wStartPos[0]);
    var endNode = _findNodeElement.call(this, wEndPos[0]);

    var startNodeId = startNode.getAttribute("id");
    var startNodePos = this.docCtrl.getPosition(startNodeId) ;
    var startCharPos = this.nodes[startNodeId].getCharPosition(wStartPos[0], wStartPos[1]);

    var endNodeId = endNode.getAttribute("id");
    var endNodePos = this.docCtrl.getPosition(endNodeId);
    var endCharPos = this.nodes[endNodeId].getCharPosition(wEndPos[0], wEndPos[1]);

    // the selection range in Document.Selection coordinates
    var startPos = [startNodePos, startCharPos];
    var endPos = [endNodePos, endCharPos];

    this.docCtrl.selection.set({start: startPos, end: endPos});
  };


  // Renders the current selection
  // --------
  //

  this.renderSelection = function() {

    if (this.docCtrl.selection.isNull()) {
      this.$cursor.hide();
      return;
    }

    // Hide native selection in favor of our custom one
    var wSel = window.getSelection();

    var range = this.docCtrl.selection.range();
    var startNode = this.docCtrl.getNodeFromPosition(range.start[0]);
    var startNodeView = this.renderer.nodes[startNode.id];
    var wStartPos = startNodeView.getDOMPosition(range.start[1]);

    var endNode = this.docCtrl.getNodeFromPosition(range.end[0]);
    var endNodeView = this.renderer.nodes[endNode.id];
    var wEndPos = endNodeView.getDOMPosition(range.end[1]);

    var wRange = document.createRange();
    wRange.setStart(wStartPos.startContainer, wStartPos.startOffset);
    wRange.setEnd(wEndPos.endContainer, wEndPos.endOffset);
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
    _.each(this.nodes, function(nodeView) {
      nodeView.dispose();
    });
    this.render();
  };

  // Cleanup view before removing it
  // --------
  //

  this.dispose = function() {
    this.stopListening();
    _.each(this.nodes, function(n) {
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
      node = this.docCtrl.get(nodeId);
      // TODO: this will hopefully be solved in a clean way
      // when we have done the 'renderer' refactorings
      if (this.nodeTypes[node.type]) {
        var nodeView = this.renderer.createView(node);
        this.nodes[nodeId] = nodeView;
        el = nodeView.render().el;
        insertOrAppend(container, diff.pos, el);
      }
    }
    else if (diff.isDelete()) {
      // Dispose the view and remove its element from the nodes container
      nodeId = diff.val;
      if (this.nodes[nodeId]) {
        this.nodes[nodeId].dispose();
      }
      delete this.nodes[nodeId];
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
