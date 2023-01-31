import React, { Component } from "react";
import * as venn from "@upsetjs/venn.js";
import * as d3 from "d3";

var sets = [
  {
    size: 3411,
    sets: ["Radiohead", "Thom Yorke", "John Lennon"],
  },
  {
    size: 5039,
    sets: ["Radiohead", "Thom Yorke"],
  },
  {
    size: 4829,
    sets: ["Radiohead", "John Lennon"],
  },
  {
    size: 14861,
    sets: ["Thom Yorke", "John Lennon"],
  },
  {
    size: 21792,
    sets: ["Radiohead"],
  },
  {
    size: 35261,
    sets: ["Thom Yorke"],
  },
  {
    size: 37272,
    sets: ["John Lennon"],
  },
];

class VennDiagram extends Component {
  constructor(props) {
    super(props);
    this.chartView = React.createRef();
    this.sets = props.sets
  }
  chart = venn.VennDiagram();
  componentDidMount() {
    let div = d3.select(this.chartView);
    div.datum(sets).call(this.chart);

    var tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "venntooltip")
      .style("display", "none");

    div
      .selectAll("g")
      .on("mouseover", function (d, i) {
        console.log(this, d , i)

        // sort all the areas relative to the current item

        //console.log(d)

        venn.sortAreas(div, d);
        // Display a tooltip with the current size
        tooltip
          .transition()
          .duration(400)
          .style("opacity", 1)
          .style("display", "inline");
        tooltip.text(`${d.size} ${d.sets} Users `);

        // highlight the current path
        var selection = d3.select(this).transition("tooltip").duration(400);
        selection
          .select("path")
          .style("stroke-width", 3)
          .style("fill-opacity", d.sets.length === 1 ? 0.4 : 0.1)
          .style("stroke-opacity", 1);
      })

      .on("mousemove", function (e) {
        console.log(d3)
         console.log(e)
        console.log(tooltip);
        tooltip
          .style("left", e.pageX + "px")
          .style("top", e.pageY - 28 + "px");
      }) 

      .on("mouseout", function (d, i) {
        tooltip.transition().duration(400).style("opacity", 0);
        var selection = d3.select(this).transition("tooltip").duration(400);
        selection
          .select("path")
          .style("stroke-width", 0)
          .style("fill-opacity", d.sets.length === 1 ? 0.25 : 0.0)
          .style("stroke-opacity", 0);
      });
  }
  render() {
    return (
      <div className="venn-div">
        <div className="" ref={(el) => (this.chartView = el)}></div>
      </div>
    );
  }
}

export default VennDiagram;
