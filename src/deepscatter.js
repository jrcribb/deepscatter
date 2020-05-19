import Tile from './tile.js';
import {ReglRenderer} from './regl_rendering.js';
import Zoom from './interaction.js';
import {select} from 'd3-selection';
import {geoPath, geoIdentity} from 'd3-geo';
import {json as d3json } from 'd3-fetch';
import {max} from 'd3-array';
import * as topojson from "topojson-client";

const base_elements = [
  {
    id: 'canvas-2d-background',
    nodetype: 'canvas'
  },
  {
    id: 'webgl-canvas',
    nodetype: 'canvas'
  },
  {
    id: 'canvas-2d',
    nodetype: 'canvas'
  },
  {
    id: 'deepscatter-svg',
    nodetype: 'svg'
  }
]

export default class Scatterplot {

  constructor(selector, width, height) {
    console.warn("INITIALIZING")

    this.width = width
    this.height = height

    this.div = select(selector);

    this.elements = []
    this.filters = new Map();


    for (const d of base_elements) {
      const container =
      this.div
       .append("div")
       .attr("id", "container-for-" + d.id)
       .style("position", "fixed")
       .style("top", 0)
       .style("left", 0)
       .style("pointer-events", d.id == "webgl-canvas" ? "auto":"none")

     container
       .append(d.nodetype)
       .attr("id", d.id)
       .attr("width", width || window.innerWidth)
       .attr("height", height || window.innerHeight)

      this.elements.push(container)
    }
  }

  reinitialize() {

    const { prefs } = this;

    this._root = new Tile(this.source_url);

    console.log("Making Renderer", this)

    this._renderer = new ReglRenderer(
      "#container-for-webgl-canvas",
      this._root,
      this,
      {width: this.width, height: this.height}

    );

    console.log("Made renderer")
    this._zoom = new Zoom("#webgl-canvas", this.prefs);

    this._zoom.attach_tiles(this._root);
    this._zoom.attach_renderer("regl", this._renderer);
    this._zoom.initialize_zoom();

    const bkgd = select("#container-for-canvas-2d-background").select("canvas")
    const ctx = bkgd.node().getContext("2d")

    ctx.fillStyle = "rgba(25, 25, 29, 1)"
    ctx.fillRect(0, 0, window.innerWidth * 2, window.innerHeight * 2)

    this._renderer.initialize()

    return this._root.promise
  }

  drawBackgroundMap(url) {
    const bkgd = select("#container-for-canvas-2d-background").select("canvas")
    const ctx = bkgd.node().getContext("2d")

    if (!this.geojson) {
      this.geojson = "in progress"
      return d3json(url).then(d => {
        console.log("FOOOO", d)
        const {x, y} = this._zoom.scales()

        const lines = topojson.mesh(d, d.objects["-"])
        const shape = topojson.merge(d, d.objects["-"].geometries)
        function fix_point(p) {
          if (!p) {return}
          if (p.coordinates) {
            return fix_point(p.coordinates)
          }
          if (!p.length) {
            return
          }
          if (p[0].length) {
            return p.map(fix_point)
          } else {
            p[0] = x(p[0])
            p[1] = y(p[1])
          }
        }
        fix_point(lines)
        fix_point(shape)
        this.geojson = {
          lines, shape
        }
        // Recurse to actually draw
        this.drawBackgroundMap(url)
      })
    }
    if (this.geojson == "in progress") {
      return
    }
    ctx.fillStyle = "rgba(25, 25, 29, 1)"
    ctx.fillRect(0, 0, window.innerWidth * 2, window.innerHeight * 2)

    console.log()
    ctx.strokeStyle = "#8a0303"//"rbga(255, 255, 255, 1)"
    ctx.fillStyle = 'rgba(30, 30, 34, 1)'

    ctx.lineWidth = max([0.45, 0.25 * Math.exp(Math.log(this._zoom.transform.k/2))]);

    const path = geoPath(geoIdentity()
      .scale(this._zoom.transform.k)
      .translate([this._zoom.transform.x, this._zoom.transform.y]), ctx);

//      ctx.beginPath(), path(this.geojson.shape), ctx.fill();
      ctx.beginPath(), path(this.geojson.lines), ctx.stroke();

  }

  update_prefs(prefs) {
    if (this.prefs === undefined) {
      this.prefs = {}
    }

    Object.assign(this.prefs, prefs)
  }

  plotAPI(prefs = {}) {

    this.update_prefs(prefs);
    /*
    if (!this._root) {
      return this.reinitialize().then(this.plotAPI(prefs))
    } */

    if (prefs['source_url'] && prefs.source_url !== this.source_url) {
      this.source_url = prefs.source_url
      this.reinitialize()
    }

    if (prefs.filters) {
      this.filters.clear()
      for (let filter_string of prefs.filters) {
        const raw_filter = Function("datum", filter_string)
        this.filters.set(filter_string, function(datum) {
          // Wrap the filter in a catch because arrow types
          // can be weird; for instance, string.match(/foo/)
          // might fail on a null value.
          try {return raw_filter(datum)}
          catch(err) {
            return false
          }
        })
      }
    }

    if (prefs.basemap_geojson) {
      this._zoom.renderers.set("basemap", {
        tick: () => {this.drawBackgroundMap(prefs.basemap_geojson)}
      })
    }

    return this._root.promise.then(d => {
      this.update_prefs(prefs)
      if (prefs.zoom) {
        this._zoom.zoom_to_bbox(prefs.zoom.bbox, prefs.duration)
      }
      this._zoom.restart_timer(60000)
    })

  }

}
