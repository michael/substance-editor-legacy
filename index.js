"use strict";

var Surface = require("./src/surface");
Surface.addEditingBehavior = require("./src/surface_editing");
Surface.EditorController = require("./src/editor_controller");
Surface.SurfaceController = require("./src/surface_controller");

module.exports = Surface;
