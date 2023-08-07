"use strict";

var inputElement = ace.edit("input");
inputElement.setTheme("ace/theme/textmate");
inputElement.$blockScrolling = Infinity;
inputElement.setOptions({
  useSoftTabs: true,
  tabSize: 2,
  maxLines: Infinity,
  autoScrollEditorIntoView: true
});

// inputElement.getSession().on('change', function() {
//   localStorage.setItem("tinysatviz-example-input", inputElement.getValue());
// });
//
// var stored_input = localStorage.getItem("tinysatviz-example-input");
// if (stored_input) {
//   inputElement.setValue(stored_input);
//   inputElement.execCommand("gotolineend");
//
// }

var output = "Ready..";
var outputElement = document.getElementById('output');
updateOutput();

var solve = async function () {

  interface_start();

  var input = inputElement.getValue();
  var solver = initSolver();

  clearOutput();
  updateOutput();

  var prop_budget = 100000;
  var conf_budget = 100000;
  var time_budget = 100000;

  var use_1uip = true;
  var use_2wl = true;

  var logger;
  logger = console.log;

  loadInput();
  solver.parse(input);
  var result = await solver.solve(logger, prop_budget, conf_budget, time_budget, use_2wl, use_1uip);

  if (result.status == SAT) {
    interface_result("SAT");
    var vline = "v"
    for (var i = 1; i < result.model.length; ++i) {
      if (result.model[i] == TRUE) {
        vline += " "+i;
      } else if (result.model[i] == FALSE) {
        vline += " -"+i;
      }
    }
    vline += "";
    // addToOutput("s SATISFIABLE");
    // addToOutput(vline);
  } else if (result.status == UNSAT) {
    interface_result("UNSAT");
    // addToOutput("s UNSATISFIABLE");
  } else {
    interface_result("ABORT");
    // addToOutput("s UNKNOWN");
  }

  interface_finish();
}

function clearOutput() {
  output = "";
}

function addToOutput(text) {
  output = text + "\n" + output;
  updateOutput();
}

function updateOutput() {
  if (outputElement) {
    var output_to_show = " ";
    if (output != "") {
      output_to_show = output;
    }
    outputElement.textContent = output_to_show;
    // outputElement.scrollTop = outputElement.scrollHeight; // focus on bottom
  }
}
