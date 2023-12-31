// This file is released under the MIT license.
// See LICENSE.md.
//
// The code in this file is taken (in modified form) from:
// https://github.com/psaikko/tinysat

"use strict";

const TRUE = 1;
const UNDEF = 0;
const FALSE = -1;

const SAT = 10;
const UNSAT = 11;
const UNKNOWN = 12;

var initSolver = function () {

  var prop_budget = 50000;
  var conf_budget = 5000;
  var time_budget = 10;

  var use_2wl;
  var use_1uip;

  var t_begin = 0;

  var logger = function(s) {};
  var litVar = Math.abs;

  var clauses = [];
  var watches = [];
  var origClauses = 0;

  var propQueue = [];

  var assignment = []
  var assignLevel = []
  var assignReason = []

  var assignStack = []

  var level = 0;

  var propagations = 0;
  var conflicts = 0;
  var decisions = 0;

  var swap = function (arr, i, j) {
    var t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }

  var arrayToString = function(arr) {
    var s = "[";
    for (var i = 0; i < arr.length; ++i) {
      s += arr[i];
      if (i != arr.length - 1) s += ",";
    }
    s += "]";
    return s;
  }

  var conflictToString = function(arr) {
    var s = "[";
    for (var i = 0; i < arr.length; ++i) {
      s += arr[i]+"@"+assignLevel[litVar(arr[i])];
      if (i != arr.length - 1) s += ",";
    }
    s += "]";
    return s;
  }

  var isWhitespace = function(c) {
    return (c == '\t') || (c == '\n') || (c == ' ');
  }

  var skipWhitespace = function (text, i) {
    while (i < text.length && isWhitespace(text[i])) ++i;
    return i;
  }

  var litPolarity = function (lit) {
    return lit < 0 ? FALSE : TRUE;
  }

  var assignmentToString = function () {
    var s = "";
    for (var i = 1; i < assignment.length; ++i) {
      if (assignment[i] == UNDEF) {
        s += i+"U";
      } else if (assignment[i] == FALSE) {
        s += i+"F@"+assignLevel[i];
      } else {
        s += i+"T@"+assignLevel[i];
      }
      if (i < assignment.length - 1) s += ",";
    }
    return s;
  }

  var addClause = function (clause) {
    clauses.push(clause);

    for (var i = 0; i < clause.length; ++i) {
      var l = clause[i];

      if (-l in watches) {
        watches[-l].push(clauses.length - 1);
      } else {
        watches[-l] = [clauses.length - 1];
      }
    }
  }

  // parse cnf format instance
  var parse = function (text) {
    var i = 0;
    var maxVar = 0;
    while (i < text.length) {
      i = skipWhitespace(text, i);
      if (i == text.length) break;

      if (text[i] == 'c') {
        while(text[i++] != '\n' && i < text.length) ;
      } else if (text[i] == 'p') {
        while(text[i++] != '\n' && i < text.length) ;
      } else {
        var clause = []
        var lit = 0;
        while (i < text.length) {
          var j = 0;
          while (!isWhitespace(text[i+j]) && i+j < text.length)
            ++j;
          lit = parseInt(text.substring(i, i+j))
          if (lit != 0) {
            maxVar = Math.max(maxVar, litVar(lit))
            clause.push(lit);
            i = skipWhitespace(text, i+j);
          } else {
            i += j;
            break;
          }
        }
        addClause(clause);
      }
    }

    for (var j = 0; j <= maxVar; ++j) {
      assignment.push(0);
      assignLevel.push(null);
      assignReason.push(null);
    }
    origClauses = clauses.length;
  }

  var pushAssignment = function (lit, reason) {
    var v = litVar(lit);
    assignment[v] = litPolarity(lit);
    assignLevel[v] = level;
    assignReason[v] = reason;
    assignStack.push(lit);

    propQueue.push({
      lit    : lit,
      reason : reason
    });
  }

  // remove all assignments and consequences after dl lnew
  var popAssignments = function (lnew) {
    // logger("backjump to level "+lnew);

    while (true) {
      var backVar = litVar(assignStack[assignStack.length - 1]);
      if (assignLevel[backVar] > lnew) {
        assignment[backVar] = UNDEF;
        assignReason[backVar] = null;
        assignLevel[backVar] = null;
        assignStack.pop();
      } else {
        break;
      }
    }
    level = lnew;
  }

  // propagate assignments in propQueue
  var propagate_2wl = async function () {

    // logger("propagate");

    var propInd = 0;
    while (propInd < propQueue.length) {

      // maintain invariant:
      //   both first literals unassigned OR
      //   one of first literals satisfies clause
      // otherwise:
      //   propagate single unassigned literal OR
      //   report conflict


      var prop_lit = propQueue[propInd].lit;
      propInd++;

      if (!(prop_lit in watches)) {
        // nothing to do
        // logger(prop_lit + " not watched");
        continue;
      }

      // logger(prop_lit + " watched in " + watches[prop_lit].length);

      //nextclause: for (var i = 0; i < clauses.length; ++i) {
      nextclause: for (var wi = 0; wi < watches[prop_lit].length; ++wi) {
        //logger("clause "+i);
        var i = watches[prop_lit][wi]; // index of watched clause

        if (clauses[i].length == 1) {
          var l = clauses[i][0];
          var a = assignment[litVar(l)];
          if (a == UNDEF) {
            ++propagations;
            pushAssignment(clauses[i][0], clauses[i]);

            interface_propagate(clauses[i][0]);
            if (!should_abort && interface_wait_time_propagate != null) {
              await sleep(interface_wait_time_propagate());
              await wait_until_allowed_to_continue();
            }
          } else if (a == litPolarity(l)) {
            continue nextclause;
          } else if (a != litPolarity(l)) {
            ++conflicts;
            interface_conflict(clauses[i]);
            if (!should_abort) {
              await sleep(interface_wait_time_conflict());
              await wait_until_allowed_to_continue();
            }
            return { conflict:clauses[i] };
          }
        } else {
          var w1 = clauses[i][0];
          var w2 = clauses[i][1];
          var a1 = assignment[litVar(w1)];
          var a2 = assignment[litVar(w2)];

          if (a1 == UNDEF && a2 == UNDEF) {
            continue nextclause;
          }
          if (a1 == litPolarity(w1) || a2 == litPolarity(w2)) {
            continue nextclause;
          }

          //
          // attempt to fix invariant
          //
          var first_ok = (a1 == UNDEF);

          if (a2 == UNDEF) {
            swap(clauses[i], 0, 1);
            first_ok = true;
          }

          // now either a1 == UNDEF or both UNSAT
          for (var j = 2; j < clauses[i].length; ++j) {
            if (assignment[litVar(clauses[i][j])] == UNDEF) {
              if (first_ok) {
                swap(clauses[i], 1, j);
                continue nextclause;
              } else { // both unsat
                swap(clauses[i], 0, j);
                first_ok = true;
              }
            } else if (assignment[litVar(clauses[i][j])] == litPolarity(clauses[i][j])) {
              swap(clauses[i], 0, j);
              continue nextclause;
            }
          }

          //
          // could not fix: do propagation or conflict
          //
          a1 = assignment[litVar(clauses[i][0])];
          if (a1 != UNDEF) {
            interface_conflict(clauses[i]);
            if (!should_abort) {
              await sleep(interface_wait_time_conflict());
              await wait_until_allowed_to_continue();
            }
            ++conflicts;
            // logger("conflict "+arrayToString(clauses[i]));

            propQueue = [];
            return {
              reason: clauses[i],
              lit: prop_lit
            };
          } else {
            interface_propagate(clauses[i][0]);
            if (!should_abort && interface_wait_time_propagate != null) {
              await sleep(interface_wait_time_propagate());
              await wait_until_allowed_to_continue();
            }
            ++propagations;
            pushAssignment(clauses[i][0], clauses[i]);
            // logger("enqueue " + clauses[i][0] +" from " + arrayToString(clauses[i]));
          }
        }
      }
    }

    propQueue = [];
    return null;
  }

  // propagate assignments in propQueue
  var propagate = function () {
    // logger("propagate");
    var seen = {};
    var propInd = 0;

    while (propInd < propQueue.length) {
      var p = propQueue[propInd];
      var pv = litVar(p.lit);
      // logger("propagating "+p.lit+"@"+level+" from "+arrayToString(p.reason));
      propInd++;

      nextclause: for (var i = 0; i < clauses.length; ++i) {
        var unsats = 0;
        var undefs = 0;
        var j_undef = 0;
        for (var j = 0; j < clauses[i].length; ++j) {
          var l = clauses[i][j];
          var a = assignment[litVar(l)];
          if (a == UNDEF) {
            ++undefs;
            if (undefs > 1) continue nextclause;
            j_undef = j;
          } else if (a == litPolarity(l)) {
            continue nextclause;
          } else if (a != litPolarity(l)) {
            ++unsats;
          }
        }

        if (unsats == clauses[i].length) {
          ++conflicts;
          // logger("conflict "+arrayToString(clauses[i]));
          propQueue = [];
          propInd = 0;
          return {
            reason:clauses[i],
            lit:p
          };
        } else if (unsats == clauses[i].length - 1 &&
                   !seen[clauses[i][j_undef]]) {
          seen[clauses[i][j_undef]] = true;
          pushAssignment(clauses[i][j_undef], clauses[i]);
          ++propagations;
          // logger("enqueue " + clauses[i][j_undef] +
          //             " from " + arrayToString(clauses[i]));
        }
      }
    }

    propQueue = [];
    propInd = 0;
    return null;
  }

  var analyze_1uip = function (conflict) {
    // logger("analyze "+conflictToString(conflict));

    if (level == 0) return [];

    var seen = {};
    var i_stack = assignStack.length - 1;

    var clause = [];
    var assertingLits = 0;

    var lit = null;
    var v = null;
    var reason = null;

    var conflict_graph = {};
    var j_stack = assignStack.length - 1;
    while (j_stack >= 0) {
      lit = assignStack[j_stack];
      --j_stack;
      var v = litVar(lit);
      var reason = assignReason[v];
      conflict_graph[lit] = {
        'side': 'left',
        'reason': reason,
        'level': assignLevel[v],
      };
    }
    conflict_graph['bot'] = {
      'side': 'right',
      'reason': conflict,
    }
    var lit = null;
    var v = null;
    var reason = conflict

    do {
      for (var i = 0; i < reason.length; ++i) {
        var vi = litVar(reason[i]);
        if (!seen[vi] && vi != v && assignLevel[vi] > 0) {
          seen[vi] = true;
          if (assignLevel[vi] >= level) {
            // logger(reason[i]+" deferred");
            ++assertingLits;
          } else {
            // logger(reason[i]+" included");
            clause.push(reason[i]);
          }
        }
      }

      // discard assigned variables not seen in analysis
      while (!seen[litVar(assignStack[i_stack])]) {
        --i_stack;
      }

      // lit was used to derive conflict
      lit = assignStack[i_stack];
      --i_stack;
      v = litVar(lit)

      // analyze reason for v next
      reason = assignReason[v];
      seen[v] = false;

      if (assertingLits > 1) {
        conflict_graph[lit]['side'] = 'right';
      }

      --assertingLits;

      // logger(lit+" from "+conflictToString(reason));
    } while (assertingLits > 0);

    clause.push(-lit);
    swap(clause, 0, clause.length-1);

    interface_analyze(conflict_graph);
    interface_learned_clause(clause);

    // logger("learn clause "+conflictToString(clause)+" at l"+level);
    return clause;
  }

  var analyze = function (conflict) {
    // logger("analyze "+conflictToString(conflict));
    var clause = [];
    var stack = [];
    var seen = {};

    for (var i = 0; i < conflict.length; ++i) {
        stack.push(conflict[i]);
        seen[conflict[i]] = true;
    }

    while (stack.length > 0) {
      var l = stack.pop();
      var v = litVar(l);
      var reason = assignReason[v];

      if (reason.length == 0) {// l was a decision
        clause.push(l);
      } else {
        for (var i = 0; i < reason.length; ++i)
          if (!seen[reason[i]] && litVar(reason[i]) != v) { // add implying assignment to stack
            stack.push(reason[i]);
            seen[reason[i]] = true;
          }
      }
    }

    // move asserting literal to front
    for (var i = 0; i < clause.length; ++i) {
      if (assignLevel[litVar(clause[i])] > assignLevel[litVar(clause[0])]) {
        swap(clause, i , 0);
      }
    }

    // logger("learn clause "+conflictToString(clause)+" at l"+level);
    return clause;
  }

  var decision = function () {
    // TODO: VSIDS
    for (var i = 1; i < assignment.length; ++i) {
      if (assignment[i] == UNDEF) {
        ++decisions;
        // logger("decision "+i);
        return i;
      }
    }
    return 0; // no undefs = SAT
  }

  var cdcl = async function (_log, _prop, _conf, _time, _2wl, _1uip) {
    // TODO: restarts

    if (_time) time_budget  = _time;
    if (_conf) conf_budget = _conf;
    if (_prop) prop_budget = _prop;
    if (_log) logger = _log;
    if (_2wl) use_2wl = true;
    if (_1uip) use_1uip = true;

    t_begin = (new Date()).getTime();

    // logger("init cdcl")

    for (var i = 0; i < clauses.length; ++i) {
      if (clauses[i].length == 1) {
        interface_propagate(clauses[i][0]);
        if (!should_abort && interface_wait_time_propagate != null) {
          await sleep(interface_wait_time_propagate());
          await wait_until_allowed_to_continue();
        }
        pushAssignment(clauses[i][0], []);
      }
    }

    while (true) {

      if (should_abort) {
        return {
          status: UNKNOWN,
        }
      }

      if (propagations > prop_budget ||
          conflicts > conf_budget ||
          ((new Date()).getTime() - t_begin) / 1000 > time_budget) {
        console.log("budget exceeded");
        console.log("propagations: "+propagations+
                    "\nconflicts: "+conflicts+
                    "\ndecisions: "+decisions+
                    "\ntime: "+(((new Date()).getTime() - t_begin) / 1000));
        return {
          status: UNKNOWN,
          budgets: {
            'propagations': propagations,
            'conflicts': conflicts,
            'time': ((new Date()).getTime() - t_begin)
          }
        };
      }
      // logger("- - - - - - - - - - -");

      var conflict = use_2wl ? await propagate_2wl() : await propagate();
      interface_done_propagating();
      if (!should_abort) {
        await sleep(interface_wait_time_propagate_round());
        await wait_until_allowed_to_continue();
      }

      if (conflict) {
        var learnt = use_1uip ? analyze_1uip(conflict.reason) : analyze(conflict.reason);
        if (learnt.length == 0) {
          // logger("propagations: "+propagations+"\nconflicts: "+conflicts+"\ndecisions: "+decisions);
          return {
            status: UNSAT
          };
        }
        addClause(learnt);

        if (!should_abort) {
          await sleep(interface_wait_time_learn());
          await wait_until_allowed_to_continue();
        }

        // backjump to earliest level at which learnt is unit
        var popTo = 0;
        for (var i = 1; i < learnt.length; ++i) {
          var i_level = assignLevel[litVar(learnt[i])];
          if (i_level != level);
            popTo = Math.max(popTo, i_level);
        }

        popAssignments(popTo);
        // by convention first literal is asserting
        pushAssignment(learnt[0], learnt);

        interface_backjump(popTo);
        interface_propagate(learnt[0]);
        if (!should_abort) {
          await sleep(interface_wait_time_backjump());
          await wait_until_allowed_to_continue();
        }
      } else {

        var branch_var = decision();

        if (branch_var) {
          interface_decide(branch_var);
          if (!should_abort) {
            await sleep(interface_wait_time_decide());
            await wait_until_allowed_to_continue();
          }

          ++level;
          pushAssignment(branch_var, []);
        } else {
          // SAT
          // logger("assignment "+assignmentToString());
          // logger("propagations: "+propagations+"\nconflicts: "+conflicts);
          return {
            status: SAT,
            model: assignment
          };
        }
      }
    }
  }

  return {
    parse:parse,
    solve:cdcl
  }
};

if (typeof module !== 'undefined') {
  module.exports.initSolver = initSolver;
  module.exports.status = {
    'UNSAT' : UNSAT,
    'SAT' : SAT,
    'UNKNOWN' : UNKNOWN
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function until(conditionFunction) {
  const poll = resolve => {
    if(conditionFunction()) resolve();
    else setTimeout(_ => poll(resolve), 400);
  }
  return new Promise(poll);
}

async function wait_until_allowed_to_continue() {
  await until(_ => can_continue == true);
}
