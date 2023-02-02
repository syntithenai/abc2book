import React, { Component , useEffect} from "react";
import * as venn from "@upsetjs/venn.js";
import * as d3 from "d3";
import {useNavigate} from 'react-router-dom'

export default function VennDiagram(props) {
  
    var chartView = React.createRef();
    var chart = venn.VennDiagram().width(800).height(800);
    var scale = 0.5
    var navigate = useNavigate()
    function createChart(data) {
        try { 
            if (data) {
                console.log(data)
                let div = d3.select(chartView);
                //scale = d3.selectAll('#scale_input').nodes()[0].value;
                
                div.datum(data).call(chart);
                //chart.scaleToFit(scale);
                
                var tooltip = d3
                  .select("body")
                  .append("div")
                  .attr("class", "venntooltip")
                  .style("display", "none");

                div
                  .selectAll("g")
                  .on("mouseover", function (d, i) {
                    ////console.log(d , i)
                    //venn.sortAreas(div, d);
                    //// Display a tooltip with the current size
                    //tooltip
                      //.transition()
                      //.duration(400)
                      //.style("opacity", 1)
                      //.style("display", "inline");
                    //tooltip.text(`${d.size} ${d.sets} Users `);

                    //// highlight the current path
                    //var selection = d3.select(chartView).transition("tooltip").duration(400);
                    //selection
                      //.select("path")
                      //.style("stroke-width", 3)
                      //.style("fill-opacity", d.sets.length === 1 ? 0.4 : 0.1)
                      //.style("stroke-opacity", 1);
                  })

                  .on("mousemove", function (e) {
                    //console.log(d3)
                     //console.log(e)
                    //console.log(tooltip);
                    //tooltip
                      //.style("left", e.pageX + "px")
                      //.style("top", e.pageY - 28 + "px");
                  }) 

                  .on("mouseout", function (d, i) {
                    //tooltip.transition().duration(400).style("opacity", 0);
                    //var selection = d3.select(chartView).transition("tooltip").duration(400);
                    //selection
                      //.select("path")
                      //.style("stroke-width", 0)
                      //.style("fill-opacity", d.sets.length === 1 ? 0.25 : 0.0)
                      //.style("stroke-opacity", 0);
                  })
                  .on("click", function (d, i) {
                    console.log('click',d,i)
                  })
                  ;
              }
            } catch (e) {
                console.log(e)
            }
    }
      
    useEffect(function() {
        console.log('SETS CHANGE',props.sets)
          createChart(props.sets)
    },[props.sets])
      
     
    return <div className="venn-div">
     <div style={{width:'1200px'}} className="" ref={(el) => (chartView = el)}></div>
      </div>
    

}
//    DD{JSON.stringify(props.sets)}FF
      //DD{JSON.stringify(sets)}FF
     
