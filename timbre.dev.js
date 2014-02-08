/**
 * T("timbre.js") - A JavaScript library for objective sound programming
 */
(function(undefined) {
    "use strict";

    if (typeof Float32Array === "undefined") {
        /*jshint latedef:true */
        setupTypedArray();
        /*jshint latedef:false */
    }

    var timbre = function() {
        return T.apply(null, arguments);
    };

    var slice = Array.prototype.slice;

    var FINISHED_STATE    = 0;
    var PLAYING_STATE     = 1;
    var UNSCHEDULED_STATE = 2; // (not use)
    var SCHEDULED_STATE   = 3; // (not use)

    var ACCEPT_SAMPLERATES = [8000,11025,12000,16000,22050,24000,32000,44100,48000];
    var ACCEPT_CELLSIZES = [32,64,128,256];

    var _ver = "13.08.03";
    var _sys = null;
    var _constructors = {};
    var _factories    = {};
    var _envtype = (typeof module !== "undefined" && module.exports) ? "node" :
        (typeof window !== "undefined") ? "browser" : "unknown";
    var _envmobile = _envtype === "browser" && /(iPhone|iPad|iPod|Android)/i.test(navigator.userAgent);
    var _f64mode = false;
    var _bpm = 120;

    var T = function() {
        var args = slice.call(arguments), key = args[0], t, m;

        switch (typeof key) {
        case "string":
            if (_constructors[key]) {
                t = new _constructors[key](args.slice(1));
            } else if (_factories[key]) {
                t = _factories[key](args.slice(1));
            } else {
                m = /^(.+?)(?:\.(ar|kr))?$/.exec(key);
                if (m) {
                    key = m[1];
                    if (_constructors[key]) {
                        t = new _constructors[key](args.slice(1));
                    } else if (_factories[key]) {
                        t = _factories[key](args.slice(1));
                    }
                    if (t && m[2]) {
                        t[m[2]]();
                    }
                }
            }
            break;
        case "number":
            t = new NumberWrapper(args);
            break;
        case "boolean":
            t = new BooleanWrapper(args);
            break;
        case "function":
            t = new FunctionWrapper(args);
            break;
        case "object":
            if (key !== null) {
                if (key instanceof TimbreObject) {
                    return key;
                } else if (key.context instanceof TimbreObject) {
                    return key.context;
                } else if (isDictionary(key)) {
                    t = new ObjectWrapper(args);
                } else if (isArray(key)) {
                    t = new ArrayWrapper(args);
                }
            }
            break;
        }

        if (t === undefined) {
            t = new AddNode(args.slice(1));
            console.warn("T(\"" + key + "\") is not defined.");
        }

        var _ = t._;
        _.originkey = key;
        _.meta = __buildMetaData(t);
        _.emit("init");

        return t;
    };

    var __buildMetaData = function(instance) {
        var meta = instance._.meta;
        var names, desc;
        var p = instance;
        while (p !== null && p.constructor !== Object) {
            names = Object.getOwnPropertyNames(p);
            for (var i = 0, imax = names.length; i < imax; ++i) {
                if (meta[names[i]]) {
                    continue;
                }
                if (/^(constructor$|process$|_)/.test(names[i])) {
                    meta[names[i]] = "ignore";
                } else {
                    desc = Object.getOwnPropertyDescriptor(p, names[i]);
                    if (typeof desc.value === "function") {
                        meta[names[i]] = "function";
                    } else if (desc.get || desc.set) {
                        meta[names[i]] = "property";
                    }
                }
            }
            p = Object.getPrototypeOf(p);
        }
        return meta;
    };

    // properties
    Object.defineProperties(timbre, {
        version  : { value: _ver },
        envtype  : { value: _envtype },
        envmobile: { value: _envmobile },
        env: {
            get: function() {
                return _sys.impl.env;
            }
        },
        samplerate: {
            get: function() {
                return _sys.samplerate;
            }
        },
        channels: {
            get: function() {
                return _sys.channels;
            }
        },
        cellsize: {
            get: function() {
                return _sys.cellsize;
            }
        },
        currentTime: {
            get: function() {
                return _sys.currentTime;
            }
        },
        isPlaying: {
            get: function() {
                return _sys.status === PLAYING_STATE;
            }
        },
        isRecording: {
            get: function() {
                return _sys.status === SCHEDULED_STATE;
            }
        },
        amp: {
            set: function(value) {
                if (typeof value === "number") {
                    _sys.amp = value;
                }
            },
            get: function() {
                return _sys.amp;
            }
        },
        bpm: {
            set: function(value) {
                if (typeof value === "number") {
                    if (5 <= value && value <= 300) {
                        _bpm = value;
                    }
                }
            },
            get: function() {
                return _bpm;
            }
        }
    });

    timbre.bind = function(Klass, opts) {
        _sys.bind(Klass, opts);
        return timbre;
    };
    timbre.setup = function(opts) {
        _sys.setup(opts);
        return timbre;
    };
    timbre.play = function() {
        _sys.play();
        return timbre;
    };
    timbre.pause = function() {
        _sys.pause();
        return timbre;
    };
    timbre.reset = function() {
        _sys.reset();
        _sys.events.emit("reset");
        return timbre;
    };
    timbre.on = timbre.addListener = function(type, listener) {
        _sys.on(type, listener);
        return timbre;
    };
    timbre.once = function(type, listener) {
        _sys.once(type, listener);
        return timbre;
    };
    timbre.off = timbre.removeListener = function(type, listener) {
        _sys.off(type, listener);
        return timbre;
    };
    timbre.removeAllListeners = function(type) {
        _sys.removeAllListeners(type);
        return timbre;
    };
    timbre.listeners = function(type) {
        return _sys.listeners(type);
    };
    timbre.rec = function() {
        return _sys.rec.apply(_sys, arguments);
    };
    timbre.timevalue = (function() {
        var getbpm = function(str) {
            var m, bpm = _bpm;
            if ((m = /^bpm(\d+(?:\.\d+)?)/i.exec(str))) {
                bpm = Math.max(5, Math.min(300, +(m[1]||0)));
            }
            return bpm;
        };
        return function(str) {
            var m, ms, x;
            if ((m = /^(\d+(?:\.\d+)?)Hz$/i.exec(str))) {
                return +m[1] === 0 ? 0 : 1000 / +m[1];
            }
            if ((m = /L(\d+)?(\.*)$/i.exec(str))) {
                ms = 60 / getbpm(str) * (4 / (m[1]||4)) * 1000;
                ms *= [1, 1.5, 1.75, 1.875][(m[2]||"").length] || 1;
                return ms;
            }
            if ((m = /^(\d+(?:\.\d+)?|\.(?:\d+))(min|sec|m)s?$/i.exec(str))) {
                switch (m[2]) {
                case "min": return +(m[1]||0) * 60 * 1000;
                case "sec": return +(m[1]||0) * 1000;
                case "m"  : return +(m[1]||0);
                }
            }
            if ((m = /^(?:([0-5]?[0-9]):)?(?:([0-5]?[0-9]):)(?:([0-5]?[0-9]))(?:\.([0-9]{1,3}))?$/.exec(str))) {
                x = (m[1]||0) * 3600 + (m[2]||0) * 60 + (m[3]||0);
                x = x * 1000 + ((((m[4]||"")+"00").substr(0, 3))|0);
                return x;
            }
            if ((m = /(\d+)\.(\d+)\.(\d+)$/i.exec(str))) {
                x = (m[1] * 4 + (+m[2])) * 480 + (+m[3]);
                return 60 / getbpm(str) * (x / 480) * 1000;
            }
            if ((m = /(\d+)ticks$/i.exec(str))) {
                return 60 / getbpm(str) * (m[1] / 480) * 1000;
            }
            if ((m = /^(\d+)samples(?:\/(\d+)Hz)?$/i.exec(str))) {
                return m[1] * 1000 / (m[2] || timbre.samplerate);
            }
            return 0;
        };
    })();

    var fn = timbre.fn = {
        SignalArray: Float32Array,
        currentTimeIncr: 0,
        emptycell: null,
        FINISHED_STATE: FINISHED_STATE,
        PLAYING_STATE: PLAYING_STATE,
        UNSCHEDULED_STATE: UNSCHEDULED_STATE,
        SCHEDULED_STATE: SCHEDULED_STATE
    };

    var isArray = fn.isArray = Array.isArray;
    var isDictionary = fn.isDictionary = function(object) {
        return typeof object === "object" && object.constructor === Object;
    };

    fn.nop = function() {
        return this;
    };

    fn.isSignalArray = function(obj) {
        if (obj instanceof fn.SignalArray) {
            return true;
        }
        if (Array.isArray(obj) && obj.__klass && obj.__klass.type === 2) {
            return true;
        }
        return false;
    };

    // borrowed from coffee-script
    fn.extend = function(child, parent) {
        parent = parent || TimbreObject;

        for (var key in parent) {
            if (parent.hasOwnProperty(key)) {
                child[key] = parent[key];
            }
        }
        /*jshint validthis:true */
        function ctor() {
            this.constructor = child;
        }
        /*jshint validthis:false */
        ctor.prototype  = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
    };

    fn.constructorof = function(ctor, Klass) {
        var f = ctor && ctor.prototype;
        while (f) {
            if (f === Klass.prototype) {
                return true;
            }
            f = Object.getPrototypeOf(f);
        }
        return false;
    };

    fn.register = function(key, ctor) {
        if (fn.constructorof(ctor, TimbreObject)) {
            _constructors[key] = ctor;
        } else {
            _factories[key] = ctor;
        }
    };

    fn.alias = function(key, alias) {
        if (_constructors[alias]) {
            _constructors[key] = _constructors[alias];
        } else if (_factories[alias]) {
            _factories[key] = _factories[alias];
        }

    };

    fn.getClass = function(key) {
        return _constructors[key];
    };

    fn.pointer = function(src, offset, length) {
        offset = src.byteOffset + offset * src.constructor.BYTES_PER_ELEMENT;
        if (typeof length === "number") {
            return new src.constructor(src.buffer, offset, length);
        } else {
            return new src.constructor(src.buffer, offset);
        }
    };

    fn.nextTick = function(func) {
        _sys.nextTick(func);
        return timbre;
    };

    fn.fixAR = function(self) {
        self._.ar = true;
        self._.aronly = true;
    };

    fn.fixKR = function(self) {
        self._.ar = false;
        self._.kronly = true;
    };

    fn.changeWithValue = function() {
        var _ = this._;
        var x = _.value * _.mul + _.add;
        if (isNaN(x)) {
            x = 0;
        }
        var cell = this.cells[0];
        for (var i = 0, imax = cell.length; i < imax; ++i) {
            cell[i] = x;
        }
    };
    fn.changeWithValue.unremovable = true;

    fn.clone = function(src) {
        var new_instance = new src.constructor([]);
        new_instance._.ar  = src._.ar;
        new_instance._.mul = src._.mul;
        new_instance._.add = src._.add;
        new_instance._.bypassed = src._.bypassed;
        return new_instance;
    };

    fn.timer = (function() {
        var make_onstart = function(self) {
            return function() {
                if (_sys.timers.indexOf(self) === -1) {
                    _sys.timers.push(self);
                    _sys.events.emit("addObject");
                    self._.emit("start");
                    fn.buddies_start(self);
                }
            };
        };
        var make_onstop = function(self) {
            return function() {
                var i = _sys.timers.indexOf(self);
                if (i !== -1) {
                    _sys.timers.splice(i, 1);
                    self._.emit("stop");
                    _sys.events.emit("removeObject");
                    fn.buddies_stop(self);
                }
            };
        };
        return function(self) {
            var onstart = make_onstart(self);
            var onstop  = make_onstop(self);
            self.nodeType = TimbreObject.TIMER;
            self.start = function() {
                _sys.nextTick(onstart);
                return self;
            };
            self.stop = function() {
                _sys.nextTick(onstop);
                return self;
            };
            return self;
        };
    })();

    fn.listener = (function() {
        var make_onlisten = function(self) {
            return function() {
                if (_sys.listeners.indexOf(self) === -1) {
                    _sys.listeners.push(self);
                    _sys.events.emit("addObject");
                    self._.emit("listen");
                    fn.buddies_start(self);
                }
            };
        };
        var make_onunlisten = function(self) {
            return function() {
                var i = _sys.listeners.indexOf(self);
                if (i !== -1) {
                    _sys.listeners.splice(i, 1);
                    self._.emit("unlisten");
                    _sys.events.emit("removeObject");
                    fn.buddies_stop(self);
                }
            };
        };
        return function(self) {
            var onlisten = make_onlisten(self);
            var onunlisten = make_onunlisten(self);
            self.nodeType = TimbreObject.LISTENER;
            self.listen = function(buddies) {
                if (arguments.length) {
                    self.append.apply(self, arguments);
                }
                if (self.nodes.length) {
                    _sys.nextTick(onlisten);
                }
                return self;
            };
            self.unlisten = function() {
                if (arguments.length) {
                    self.remove.apply(self, arguments);
                }
                if (!self.nodes.length) {
                    _sys.nextTick(onunlisten);
                }
                return self;
            };
            return self;
        };
    })();

    fn.make_onended = function(self, lastValue) {
        return function() {
            self.playbackState = FINISHED_STATE;
            if (typeof lastValue === "number") {
                var cell  = self.cells[0];
                var cellL = self.cells[1];
                var cellR = self.cells[2];
                for (var i = 0, imax = cellL.length; i < imax; ++i) {
                    cell[0] = cellL[i] = cellR[i] = lastValue;
                }
            }
            self._.emit("ended");
        };
    };

    fn.inputSignalAR = function(self) {
        var cell  = self.cells[0];
        var cellL = self.cells[1];
        var cellR = self.cells[2];
        var nodes = self.nodes;
        var i, imax = nodes.length;
        var j, jmax = cell.length;
        var tickID  = self.tickID;
        var not_clear, tmp, tmpL, tmpR;

        if (self.numChannels === 2) {
            not_clear = true;
            if (imax !== 0) {
                for (i = 0; i < imax; ++i) {
                    if (nodes[i].playbackState === PLAYING_STATE) {
                        nodes[i].process(tickID);
                        cellL.set(nodes[i].cells[1]);
                        cellR.set(nodes[i].cells[2]);
                        not_clear = false;
                        ++i;
                        break;
                    }
                }
                for (; i < imax; ++i) {
                    if (nodes[i].playbackState === PLAYING_STATE) {
                        nodes[i].process(tickID);
                        tmpL = nodes[i].cells[1];
                        tmpR = nodes[i].cells[2];
                        for (j = jmax; j; ) {
                            j -= 8;
                            cellL[j  ] += tmpL[j  ]; cellR[j  ] += tmpR[j  ];
                            cellL[j+1] += tmpL[j+1]; cellR[j+1] += tmpR[j+1];
                            cellL[j+2] += tmpL[j+2]; cellR[j+2] += tmpR[j+2];
                            cellL[j+3] += tmpL[j+3]; cellR[j+3] += tmpR[j+3];
                            cellL[j+4] += tmpL[j+4]; cellR[j+4] += tmpR[j+4];
                            cellL[j+5] += tmpL[j+5]; cellR[j+5] += tmpR[j+5];
                            cellL[j+6] += tmpL[j+6]; cellR[j+6] += tmpR[j+6];
                            cellL[j+7] += tmpL[j+7]; cellR[j+7] += tmpR[j+7];
                        }
                    }
                }
            }
            if (not_clear) {
                cellL.set(fn.emptycell);
                cellR.set(fn.emptycell);
            }
        } else {
            not_clear = true;
            if (imax !== 0) {
                for (i = 0; i < imax; ++i) {
                    if (nodes[i].playbackState === PLAYING_STATE) {
                        nodes[i].process(tickID);
                        cell.set(nodes[i].cells[0]);
                        not_clear = false;
                        ++i;
                        break;
                    }
                }
                for (; i < imax; ++i) {
                    if (nodes[i].playbackState === PLAYING_STATE) {
                        tmp = nodes[i].process(tickID).cells[0];
                        for (j = jmax; j; ) {
                            j -= 8;
                            cell[j  ] += tmp[j  ];
                            cell[j+1] += tmp[j+1];
                            cell[j+2] += tmp[j+2];
                            cell[j+3] += tmp[j+3];
                            cell[j+4] += tmp[j+4];
                            cell[j+5] += tmp[j+5];
                            cell[j+6] += tmp[j+6];
                            cell[j+7] += tmp[j+7];
                        }
                    }
                }
            }
            if (not_clear) {
                cell.set(fn.emptycell);
            }
        }
    };

    fn.inputSignalKR = function(self) {
        var nodes = self.nodes;
        var i, imax = nodes.length;
        var tickID = self.tickID;
        var tmp = 0;
        for (i = 0; i < imax; ++i) {
            if (nodes[i].playbackState === PLAYING_STATE) {
                tmp += nodes[i].process(tickID).cells[0][0];
            }
        }
        return tmp;
    };

    fn.outputSignalAR = function(self) {
        var cell  = self.cells[0];
        var cellL = self.cells[1];
        var cellR = self.cells[2];
        var mul = self._.mul, add = self._.add;
        var i;

        if (self.numChannels === 2) {
            for (i = cell.length; i; ) {
                i -= 8;
                cellL[i  ] = cellL[i  ] * mul + add; cellR[i  ] = cellR[i  ] * mul + add;
                cellL[i+1] = cellL[i+1] * mul + add; cellR[i+1] = cellR[i+1] * mul + add;
                cellL[i+2] = cellL[i+2] * mul + add; cellR[i+2] = cellR[i+2] * mul + add;
                cellL[i+3] = cellL[i+3] * mul + add; cellR[i+3] = cellR[i+3] * mul + add;
                cellL[i+4] = cellL[i+4] * mul + add; cellR[i+4] = cellR[i+4] * mul + add;
                cellL[i+5] = cellL[i+5] * mul + add; cellR[i+5] = cellR[i+5] * mul + add;
                cellL[i+6] = cellL[i+6] * mul + add; cellR[i+6] = cellR[i+6] * mul + add;
                cellL[i+7] = cellL[i+7] * mul + add; cellR[i+7] = cellR[i+7] * mul + add;
                cell[i  ] = (cellL[i  ] + cellR[i  ]) * 0.5;
                cell[i+1] = (cellL[i+1] + cellR[i+1]) * 0.5;
                cell[i+2] = (cellL[i+2] + cellR[i+2]) * 0.5;
                cell[i+3] = (cellL[i+3] + cellR[i+3]) * 0.5;
                cell[i+4] = (cellL[i+4] + cellR[i+4]) * 0.5;
                cell[i+5] = (cellL[i+5] + cellR[i+5]) * 0.5;
                cell[i+6] = (cellL[i+6] + cellR[i+6]) * 0.5;
                cell[i+7] = (cellL[i+7] + cellR[i+7]) * 0.5;
            }
        } else {
            if (mul !== 1 || add !== 0) {
                for (i = cell.length; i; ) {
                    i -= 8;
                    cell[i  ] = cell[i  ] * mul + add;
                    cell[i+1] = cell[i+1] * mul + add;
                    cell[i+2] = cell[i+2] * mul + add;
                    cell[i+3] = cell[i+3] * mul + add;
                    cell[i+4] = cell[i+4] * mul + add;
                    cell[i+5] = cell[i+5] * mul + add;
                    cell[i+6] = cell[i+6] * mul + add;
                    cell[i+7] = cell[i+7] * mul + add;
                }
            }
        }
    };

    fn.outputSignalKR = function(self) {
        var cell  = self.cells[0];
        var cellL = self.cells[1];
        var cellR = self.cells[2];
        var mul = self._.mul, add = self._.add;
        var value = cell[0] * mul + add;
        var i;

        if (self.numChannels === 2) {
            for (i = cell.length; i; ) {
                i -= 8;
                cell[i] = cell[i+1] = cell[i+2] = cell[i+3] = cell[i+4] = cell[i+5] = cell[i+6] = cell[i+7] = cellL[i] = cellL[i+1] = cellL[i+2] = cellL[i+3] = cellL[i+4] = cellL[i+5] = cellL[i+6] = cellL[i+7] = cellR[i] = cellR[i+1] = cellR[i+2] = cellR[i+3] = cellR[i+4] = cellR[i+5] = cellR[i+6] = cellR[i+7] = value;
            }
        } else {
            for (i = cell.length; i; ) {
                i -= 8;
                cell[i] = cell[i+1] = cell[i+2] = cell[i+3] = cell[i+4] = cell[i+5] = cell[i+6] = cell[i+7] = value;
            }
        }
    };

    fn.buddies_start = function(self) {
        var buddies = self._.buddies;
        var node, i, imax;
        for (i = 0, imax = buddies.length; i < imax; ++i) {
            node = buddies[i];
            switch (node.nodeType) {
            case TimbreObject.DSP:
                node.play();
                break;
            case TimbreObject.TIMER:
                node.start();
                break;
            case TimbreObject.LISTENER:
                node.listen();
                break;
            }
        }
    };

    fn.buddies_stop = function(self) {
        var buddies = self._.buddies;
        var node, i, imax;
        for (i = 0, imax = buddies.length; i < imax; ++i) {
            node = buddies[i];
            switch (node.nodeType) {
            case TimbreObject.DSP:
                node.pause();
                break;
            case TimbreObject.TIMER:
                node.stop();
                break;
            case TimbreObject.LISTENER:
                node.unlisten();
                break;
            }
        }
    };

    fn.fix_iOS6_1_problem = function(flag) {
        _sys.fix_iOS6_1_problem(flag);
    };

    var modules = timbre.modules = {};

    // EventEmitter
    var EventEmitter = modules.EventEmitter = (function() {
        function EventEmitter(context) {
            this.context = context;
            this.events = {};
        }

        var $ = EventEmitter.prototype;

        $.emit = function(type) {
            var handler = this.events[type];
            if (!handler) {
                return false;
            }

            var args;
            if (typeof handler === "function") {
                switch (arguments.length) {
                case 1:
                    handler.call(this.context);
                    break;
                case 2:
                    handler.call(this.context, arguments[1]);
                    break;
                case 3:
                    handler.call(this.context, arguments[1], arguments[2]);
                    break;
                default:
                    args = slice.call(arguments, 1);
                    handler.apply(this.context, args);
                }
                return true;
            } else if (isArray(handler)) {
                args = slice.call(arguments, 1);
                var listeners = handler.slice();
                for (var i = 0, imax = listeners.length; i < imax; ++i) {
                    if (listeners[i] instanceof TimbreObject) {
                        listeners[i].bang.apply(listeners[i], args);
                    } else {
                        listeners[i].apply(this.context, args);
                    }
                }
                return true;
            } else if (handler instanceof TimbreObject) {
                args = slice.call(arguments, 1);
                handler.bang.apply(handler, args);
            } else {
                return false;
            }
        };

        $.on = function(type, listener) {
            if (typeof listener !== "function" && !(listener instanceof TimbreObject)) {
                throw new Error("addListener takes instances of Function or timbre.Object");
            }
            var e = this.events;

            if (!e[type]) {
                e[type] = listener;
            } else if (isArray(e[type])) {
                e[type].push(listener);
            } else {
                e[type] = [e[type], listener];
            }
            return this;
        };

        $.once = function(type, listener) {
            var self = this;
            var g;
            if (typeof listener === "function") {
                g = function () {
                    self.off(type, g);
                    listener.apply(self.context, arguments);
                };
            } else if (listener instanceof TimbreObject) {
                g = function () {
                    self.off(type, g);
                    listener.bang.apply(listener, arguments);
                };
            } else {
                throw new Error("once takes instances of Function or timbre.Object");
            }
            g.listener = listener;

            self.on(type, g);

            return this;
        };

        $.off = function(type, listener) {
            if (typeof listener !== "function" && !(listener instanceof TimbreObject)) {
                throw new Error("removeListener takes instances of Function or timbre.Object");
            }
            var e = this.events;

            if (!e[type]) {
                return this;
            }

            var list = e[type];

            if (isArray(list)) {
                var position = -1;
                for (var i = 0, imax = list.length; i < imax; ++i) {
                    if (list[i] === listener ||
                        // once listener
                        (list[i].listener && list[i].listener === listener)) {
                        position = i;
                        break;
                    }
                }

                if (position < 0) {
                    return this;
                }
                list.splice(position, 1);
                if (list.length === 0) {
                    e[type] = null;
                }
            } else if (list === listener ||
                       // once listener
                       (list.listener && list.listener === listener)) {
                e[type] = null;
            }

            return this;
        };

        $.removeAllListeners = function(type) {
            var e = this.events;

            var remain = false;
            var listeners = e[type];
            if (isArray(listeners)) {
                for (var i = listeners.length; i--; ) {
                    var listener = listeners[i];
                    if (listener.unremovable) {
                        remain = true;
                        continue;
                    }
                    this.off(type, listener);
                }
            } else if (listeners) {
                if (!listeners.unremovable) {
                    this.off(type, listeners);
                } else {
                    remain = true;
                }
            }
            if (!remain) {
                e[type] = null;
            }

            return this;
        };

        $.listeners = function(type) {
            var a, e = this.events;
            if (!e[type]) {
                return [];
            }
            e = e[type];
            if (!isArray(e)) {
                return e.unremovable ? [] : [e];
            }
            e = e.slice();
            a = [];
            for (var i = 0, imax = e.length; i < imax; ++i) {
                if (!e[i].unremovable) {
                    a.push(e[i]);
                }
            }
            return a;
        };

        return EventEmitter;
    })();

    var Deferred = modules.Deferred = (function() {
        function Deferred(context) {
            this.context = context || this;
            this._state = "pending";
            this._doneList = [];
            this._failList = [];

            this._promise = new Promise(this);
        }

        var $ = Deferred.prototype;

        var exec = function(statue, list, context, args) {
            if (this._state === "pending") {
                this._state = statue;
                for (var i = 0, imax = list.length; i < imax; ++i) {
                    list[i].apply(context, args);
                }
                this._doneList = this._failList = null;
            }
        };

        var isDeferred = function(x) {
            return x && typeof x.promise === "function";
        };

        $.resolve = function() {
            var args = slice.call(arguments, 0);
            exec.call(this, "resolved", this._doneList, this.context || this, args);
            return this;
        };
        $.resolveWith = function(context) {
            var args = slice.call(arguments, 1);
            exec.call(this, "resolved", this._doneList, context, args);
            return this;
        };
        $.reject = function() {
            var args = slice.call(arguments, 0);
            exec.call(this, "rejected", this._failList, this.context || this, args);
            return this;
        };
        $.rejectWith = function(context) {
            var args = slice.call(arguments, 1);
            exec.call(this, "rejected", this._failList, context, args);
            return this;
        };

        $.promise = function() {
            return this._promise;
        };
        $.done = function() {
            var args = slice.call(arguments);
            var isResolved = (this._state === "resolved");
            var isPending  = (this._state === "pending");
            var list = this._doneList;
            for (var i = 0, imax = args.length; i < imax; ++i) {
                if (typeof args[i] === "function") {
                    if (isResolved) {
                        args[i]();
                    } else if (isPending) {
                        list.push(args[i]);
                    }
                }
            }
            return this;
        };
        $.fail = function() {
            var args = slice.call(arguments);
            var isRejected = (this._state === "rejected");
            var isPending  = (this._state === "pending");
            var list = this._failList;
            for (var i = 0, imax = args.length; i < imax; ++i) {
                if (typeof args[i] === "function") {
                    if (isRejected) {
                        args[i]();
                    } else if (isPending) {
                        list.push(args[i]);
                    }
                }
            }
            return this;
        };
        $.always = function() {
            this.done.apply(this, arguments);
            this.fail.apply(this, arguments);
            return this;
        };
        $.then = function then(done, fail) {
            return this.done(done).fail(fail);
        };
        $.pipe = function(done, fail) {
            var self = this;
            var dfd = new Deferred(this.context);

            this.done(function() {
                var res = done.apply(self.context, arguments);
                if (isDeferred(res)) {
                    res.then(function() {
                        var args = slice.call(arguments);
                        dfd.resolveWith.apply(dfd, [res].concat(args));
                    });
                } else {
                    dfd.resolveWith(self, res);
                }
            });
            this.fail(function() {
                if (typeof fail === "function") {
                    var res = fail.apply(self.context, arguments);
                    if (isDeferred(res)) {
                        res.fail(function() {
                            var args = slice.call(arguments);
                            dfd.rejectWith.apply(dfd, [res].concat(args));
                        });
                    }
                } else {
                    dfd.reject.apply(dfd, arguments);
                }
            });

            return dfd.promise();
        };
        // $.then = $.pipe;

        $.isResolved = function() {
            return this._state === "resolved";
        };
        $.isRejected = function() {
            return this._state === "rejected";
        };
        $.state = function() {
            return this._state;
        };

        // TODO: test
        Deferred.when = function(subordinate) {
            var i = 0;
            var resolveValues = slice.call(arguments);
            var length    = resolveValues.length;
            var remaining = length;

            if (length === 1 && !isDeferred(subordinate)) {
                remaining = 0;
            }
            var deferred = (remaining === 1) ? subordinate : new Deferred();

            var updateFunc = function(i, results) {
                return function(value) {
                    results[i] = arguments.length > 1 ? slice.call(arguments) : value;
                    if (!(--remaining)) {
                        deferred.resolve.apply(deferred, results);
                    }
                };
            };

            if (length > 1) {
                var resolveResults = new Array(length);
                var onfailed = function() {
                    deferred.reject();
                };
                for (; i < length; ++i) {
                    if (resolveValues[i] && isDeferred(resolveValues[i])) {
                        resolveValues[i].promise().done(
                            updateFunc(i, resolveResults)
                        ).fail(onfailed);
                    } else {
                        resolveResults[i] = resolveValues[i];
                        --remaining;
                    }
                }
            }

            if (!remaining) {
                deferred.resolve.apply(deferred, resolveValues);
            }

            return deferred.promise();
        };

        function Promise(object) {
            this.context = object.context;
            this.then = object.then;
            this.done = function() {
                object.done.apply(object, arguments);
                return this;
            };
            this.fail = function() {
                object.fail.apply(object, arguments);
                return this;
            };
            this.pipe = function() {
                return object.pipe.apply(object, arguments);
            };
            this.always = function() {
                object.always.apply(object, arguments);
                return this;
            };
            this.promise = function() {
                return this;
            };
            this.isResolved = function() {
                return object.isResolved();
            };
            this.isRejected = function() {
                return object.isRejected();
            };
        }

        return Deferred;
    })();

    // root object
    var TimbreObject = timbre.Object = (function() {
        function TimbreObject(numChannels, _args) {
            this._ = {}; // private members
            var e = this._.events = new EventEmitter(this);
            this._.emit = function() {
                return e.emit.apply(e, arguments);
            };
            if (isDictionary(_args[0])) {
                var params = _args.shift();
                var _in = params["in"];
                this.once("init", function() {
                    this.set(params);
                    if (_in) {
                        if (isArray(_in)) {
                            this.append.apply(this, _in);
                        } else if (_in instanceof TimbreObject) {
                            this.append(_in);
                        }
                    }
                });
            }

            this.tickID = -1;
            this.nodes  = _args.map(timbre);
            this.cells  = [];
            this.numChannels = numChannels;
            switch (numChannels) {
            case 0:
                this.L = this.R = new ChannelObject(null);
                this.cells[0] = this.cells[1] = this.cells[2] = this.L.cell;
                break;
            case 1:
                this.L = this.R = new ChannelObject(this);
                this.cells[0] = this.cells[1] = this.cells[2] = this.L.cell;
                break;
            case 2:
                this.L = new ChannelObject(this);
                this.R = new ChannelObject(this);
                this.cells[0] = new fn.SignalArray(_sys.cellsize);
                this.cells[1] = this.L.cell;
                this.cells[2] = this.R.cell;
                break;
            }
            this.playbackState = PLAYING_STATE;
            this.nodeType = TimbreObject.DSP;

            this._.ar  = true;
            this._.mul = 1;
            this._.add = 0;
            this._.dac = null;
            this._.bypassed = false;
            this._.meta = {};
            this._.samplerate = _sys.samplerate;
            this._.cellsize   = _sys.cellsize;
            this._.buddies    = [];
        }
        TimbreObject.DSP      = 1;
        TimbreObject.TIMER    = 2;
        TimbreObject.LISTENER = 3;

        var $ = TimbreObject.prototype;

        Object.defineProperties($, {
            isAr: {
                get: function() {
                    return this._.ar;
                }
            },
            isKr: {
                get: function() {
                    return !this._.ar;
                }
            },
            isBypassed: {
                get: function() {
                    return this._.bypassed;
                }
            },
            isEnded: {
                get: function() {
                    return !(this.playbackState & 1);
                }
            },
            mul: {
                set: function(value) {
                    if (typeof value === "number") {
                        this._.mul = value;
                        this._.emit("setMul", value);
                    }
                },
                get: function() {
                    return this._.mul;
                }
            },
            add: {
                set: function(value) {
                    if (typeof value === "number") {
                        this._.add = value;
                        this._.emit("setAdd", value);
                    }
                },
                get: function() {
                    return this._.add;
                }
            },
            buddies: {
                set: function(value) {
                    if (!isArray(value)) {
                        value = [value];
                    }
                    this._.buddies = value.filter(function(node) {
                        return node instanceof TimbreObject;
                    });
                },
                get: function() {
                    return this._.buddies;
                }
            }
        });

        $.toString = function() {
            return this.constructor.name;
        };

        $.valueOf = function() {
            if (_sys.tickID !== this.tickID) {
                this.process(_sys.tickID);
            }
            return this.cells[0][0];
        };

        $.append = function() {
            if (arguments.length > 0) {
                var list = slice.call(arguments).map(timbre);
                this.nodes = this.nodes.concat(list);
                this._.emit("append", list);
            }
            return this;
        };

        $.appendTo = function(object) {
            object.append(this);
            return this;
        };

        $.remove = function() {
            if (arguments.length > 0) {
                var j, nodes = this.nodes, list = [];
                for (var i = 0, imax = arguments.length; i < imax; ++i) {
                    if ((j = nodes.indexOf(arguments[i])) !== -1) {
                        list.push(nodes[j]);
                        nodes.splice(j, 1);
                    }
                }
                if (list.length > 0) {
                    this._.emit("remove", list);
                }
            }
            return this;
        };

        $.removeFrom = function(object) {
            object.remove(this);
            return this;
        };

        $.removeAll = function() {
            var list = this.nodes.slice();
            this.nodes = [];
            if (list.length > 0) {
                this._.emit("remove", list);
            }
            return this;
        };

        $.removeAtIndex = function(index) {
            var item = this.nodes[index];
            if (item) {
                this.nodes.splice(index, 1);
                this._.emit("remove", [item]);
            }
            return this;
        };

        $.postMessage = function(message) {
            this._.emit("message", message);
            return this;
        };

        $.to = function(object) {
            if (object instanceof TimbreObject) {
                object.append(this);
            } else {
                var args = slice.call(arguments);
                if (isDictionary(args[1])) {
                    args.splice(2, 0, this);
                } else {
                    args.splice(1, 0, this);
                }
                object = T.apply(null, args);
            }
            return object;
        };

        $.splice = function(ins, obj, rem) {
            var i;
            if (!obj) {
                if (this._.dac) {
                    if (ins instanceof TimbreObject) {
                        if (rem instanceof TimbreObject) {
                            if (rem._.dac) {
                                rem._.dac._.node = ins;
                                ins._.dac = rem._.dac;
                                rem._.dac = null;
                                ins.nodes.push(this);
                            }
                        } else {
                            if (this._.dac) {
                                this._.dac._.node = ins;
                                ins._.dac = this._.dac;
                                this._.dac = null;
                                ins.nodes.push(this);
                            }
                        }
                    } else if (rem instanceof TimbreObject) {
                        if (rem._.dac) {
                            rem._.dac._.node = this;
                            this._.dac = rem._.dac;
                            rem._.dac = null;
                        }
                    }
                }
            } else {
                if (obj instanceof TimbreObject) {
                    i = obj.nodes.indexOf(rem);
                    if (i !== -1) {
                        obj.nodes.splice(i, 1);
                    }
                    if (ins instanceof TimbreObject) {
                        ins.nodes.push(this);
                        obj.nodes.push(ins);
                    } else {
                        obj.nodes.push(this);
                    }
                }
            }
            return this;
        };

        // EventEmitter
        $.on = $.addListener = function(type, listener) {
            this._.events.on(type, listener);
            return this;
        };

        $.once = function(type, listener) {
            this._.events.once(type, listener);
            return this;
        };

        $.off = $.removeListener = function(type, listener) {
            this._.events.off(type, listener);
            return this;
        };

        $.removeAllListeners = function(type) {
            this._.events.removeAllListeners(type);
            return this;
        };

        $.listeners = function(type) {
            return this._.events.listeners(type);
        };

        $.set = function(key, value) {
            var x, desc, meta = this._.meta;
            switch (typeof key) {
            case "string":
                switch (meta[key]) {
                case "property":
                    this[key] = value;
                    break;
                case "function":
                    this[key](value);
                    break;
                default:
                    x = this;
                    while (x !== null) {
                        desc = Object.getOwnPropertyDescriptor(x, key);
                        if (desc) {
                            if (typeof desc.value === "function") {
                                meta[key] = "function";
                                this[key](value);
                            } else if (desc.get || desc.set) {
                                meta[key] = "property";
                                this[key] = value;
                            }
                        }
                        x = Object.getPrototypeOf(x);
                    }
                }
                break;
            case "object":
                for (x in key) {
                    this.set(x, key[x]);
                }
                break;
            }
            return this;
        };

        $.get = function(key) {
            if (this._.meta[key] === "property") {
                return this[key];
            }
        };

        $.bang = function() {
            this._.emit.apply(this, ["bang"].concat(slice.call(arguments)));
            return this;
        };

        $.process = fn.nop;

        $.bypass = function() {
            this._.bypassed = (arguments.length === 0) ? true : !!arguments[0];
            return this;
        };

        $.play = function() {
            var dac = this._.dac;
            if (dac === null) {
                dac = this._.dac = new SystemInlet(this);
            }
            if (dac.play()) {
                this._.emit.apply(this, ["play"].concat(slice.call(arguments)));
            }
            fn.buddies_start(this);
            return this;
        };

        $.pause = function() {
            var dac = this._.dac;
            if (dac && dac.playbackState === PLAYING_STATE) {
                dac.pause();
                this._.dac = null;
                this._.emit("pause");
            }
            fn.buddies_stop(this);
            return this;
        };

        $.start = $.stop = $.listen = $.unlisten = function() {
            return this;
        };

        $.ar = function() {
            if ((arguments.length === 0) ? true : !!arguments[0]) {
                if (!this._.kronly) {
                    this._.ar = true;
                    this._.emit("ar", true);
                }
            } else {
                this.kr(true);
            }
            return this;
        };

        $.kr = function() {
            if ((arguments.length === 0) ? true : !!arguments[0]) {
                if (!this._.aronly) {
                    this._.ar = false;
                    this._.emit("ar", false);
                }
            } else {
                this.ar(true);
            }
            return this;
        };

        if (_envtype === "browser") {
            $.plot = function(opts) {
                var _ = this._;
                var canvas = opts.target;

                if (!canvas) {
                    return this;
                }

                var width    = opts.width  || canvas.width  || 320;
                var height   = opts.height || canvas.height || 240;
                var offset_x = (opts.x || 0) + 0.5;
                var offset_y = (opts.y || 0);

                var context = canvas.getContext("2d");

                var foreground;
                if (opts.foreground !== undefined) {
                    foreground = opts.foreground;
                } else{
                    foreground = _.plotForeground || "rgb(  0, 128, 255)";
                }
                var background;
                if (opts.background !== undefined) {
                    background = opts.background;
                } else {
                    background = _.plotBackground || "rgb(255, 255, 255)";
                }
                var lineWidth  = opts.lineWidth  || _.plotLineWidth || 1;
                var cyclic     = !!_.plotCyclic;

                var data  = _.plotData || this.cells[0];
                var range = opts.range || _.plotRange || [-1.2, +1.2];
                var rangeMin   = range[0];
                var rangeDelta = height / (range[1] - rangeMin);

                var x, dx = (width / data.length);
                var y, dy, y0;
                var i, imax = data.length;

                context.save();

                context.rect(offset_x, offset_y, width, height);
                // context.clip();

                if (background !== null) {
                    context.fillStyle = background;
                    context.fillRect(offset_x, offset_y, width, height);
                }
                if (_.plotBefore) {
                    _.plotBefore.call(
                        this, context, offset_x, offset_y, width, height
                    );
                }

                if (_.plotBarStyle) {
                    context.fillStyle = foreground;
                    x = 0;
                    for (i = 0; i < imax; ++i) {
                        dy = (data[i] - rangeMin) * rangeDelta;
                        y  = height - dy;
                        context.fillRect(x + offset_x, y + offset_y, dx, dy);
                        x += dx;
                    }
                } else {
                    context.strokeStyle = foreground;
                    context.lineWidth   = lineWidth;

                    context.beginPath();

                    x  = 0;
                    y0 = height - (data[0] - rangeMin) * rangeDelta;
                    context.moveTo(x + offset_x, y0 + offset_y);
                    for (i = 1; i < imax; ++i) {
                        x += dx;
                        y = height - (data[i] - rangeMin) * rangeDelta;
                        context.lineTo(x + offset_x, y + offset_y);
                    }
                    if (cyclic) {
                        context.lineTo(x + dx + offset_x, y0 + offset_y);
                    } else {
                        context.lineTo(x + dx + offset_x, y  + offset_y);
                    }
                    context.stroke();
                }

                if (_.plotAfter) {
                    _.plotAfter.call(
                        this, context, offset_x, offset_y, width, height
                    );
                }
                var border = opts.border || _.plotBorder;
                if (border) {
                    context.strokeStyle =
                        (typeof border === "string") ? border : "#000";
                    context.lineWidth = 1;
                    context.strokeRect(offset_x, offset_y, width, height);
                }

                context.restore();

                return this;
            };
        } else {
            $.plot = fn.nop;
        }

        return TimbreObject;
    })();

    var ChannelObject = timbre.ChannelObject = (function() {
        function ChannelObject(parent) {
            timbre.Object.call(this, -1, []);
            fn.fixAR(this);

            this._.parent = parent;
            this.cell = new fn.SignalArray(_sys.cellsize);

            this.L = this.R = this;
            this.cells[0] = this.cells[1] = this.cells[2] = this.cell;

            this.numChannels = 1;
        }
        fn.extend(ChannelObject);

        ChannelObject.prototype.process = function(tickID) {
            if (this.tickID !== tickID) {
                this.tickID = tickID;
                if (this._.parent) {
                    this._.parent.process(tickID);
                }
            }
            return this;
        };

        return ChannelObject;
    })();

    var AddNode = (function() {
        function AddNode(_args) {
            TimbreObject.call(this, 2, _args);
        }
        fn.extend(AddNode);

        AddNode.prototype.process = function(tickID) {
            var _ = this._;
            if (this.tickID !== tickID) {
                this.tickID = tickID;
                if (_.ar) {
                    fn.inputSignalAR(this);
                    fn.outputSignalAR(this);
                } else {
                    this.cells[0][0] = fn.inputSignalKR(this);
                    fn.outputSignalKR(this);
                }
            }
            return this;
        };
        fn.register("+", AddNode);

        return AddNode;
    })();

    var NumberWrapper = (function() {
        function NumberWrapper(_args) {
            TimbreObject.call(this, 1, []);
            fn.fixKR(this);

            this.value = _args[0];

            if (isDictionary(_args[1])) {
                var params = _args[1];
                this.once("init", function() {
                    this.set(params);
                });
            }
            this.on("setAdd", fn.changeWithValue);
            this.on("setMul", fn.changeWithValue);
        }
        fn.extend(NumberWrapper);

        var $ = NumberWrapper.prototype;

        Object.defineProperties($, {
            value: {
                set: function(value) {
                    if (typeof value === "number") {
                        this._.value = isNaN(value) ? 0 : value;
                        fn.changeWithValue.call(this);
                    }
                },
                get: function() {
                    return this._.value;
                }
            }
        });

        return NumberWrapper;
    })();

    var BooleanWrapper = (function() {
        function BooleanWrapper(_args) {
            TimbreObject.call(this, 1, []);
            fn.fixKR(this);

            this.value = _args[0];

            if (isDictionary(_args[1])) {
                var params = _args[1];
                this.once("init", function() {
                    this.set(params);
                });
            }
            this.on("setAdd", fn.changeWithValue);
            this.on("setMul", fn.changeWithValue);
        }
        fn.extend(BooleanWrapper);

        var $ = BooleanWrapper.prototype;

        Object.defineProperties($, {
            value: {
                set: function(value) {
                    this._.value = value ? 1 : 0;
                    fn.changeWithValue.call(this);
                },
                get: function() {
                    return !!this._.value;
                }
            }
        });

        return BooleanWrapper;
    })();

    var FunctionWrapper = (function() {
        function FunctionWrapper(_args) {
            TimbreObject.call(this, 1, []);
            fn.fixKR(this);

            this.func    = _args[0];
            this._.value = 0;

            if (isDictionary(_args[1])) {
                var params = _args[1];
                this.once("init", function() {
                    this.set(params);
                });
            }
            this.on("setAdd", fn.changeWithValue);
            this.on("setMul", fn.changeWithValue);
        }
        fn.extend(FunctionWrapper);

        var $ = FunctionWrapper.prototype;

        Object.defineProperties($, {
            func: {
                set: function(value) {
                    if (typeof value === "function") {
                        this._.func = value;
                    }
                },
                get: function() {
                    return this._.func;
                }
            },
            args: {
                set: function(value) {
                    if (isArray(value)) {
                        this._.args = value;
                    } else {
                        this._.args = [value];
                    }
                },
                get: function() {
                    return this._.args;
                }
            }
        });

        $.bang = function() {
            var _ = this._;
            var args = slice.call(arguments).concat(_.args);
            var x = _.func.apply(this, args);
            if (typeof x === "number") {
                _.value = x;
                fn.changeWithValue.call(this);
            }
            this._.emit("bang");
            return this;
        };

        return FunctionWrapper;
    })();

    var ArrayWrapper = (function() {
        function ArrayWrapper(_args) {
            TimbreObject.call(this, 1, []);

            var i, imax;
            for (i = 0, imax = _args[0].length; i < imax; ++i) {
              this.append(_args[0][i]);
            }

            if (isDictionary(_args[1])) {
                var params = _args[1];
                this.once("init", function() {
                    this.set(params);
                });
            }
        }
        fn.extend(ArrayWrapper);

        var $ = ArrayWrapper.prototype;

        Object.defineProperties($, {

        });

        $.bang = function() {
            var args = ["bang"].concat(slice.call(arguments));
            var nodes = this.nodes;
            var i, imax;
            for (i = 0, imax = nodes.length; i < imax; ++i) {
                nodes[i].bang.apply(nodes[i], args);
            }
            return this;
        };

        $.postMessage = function(message) {
            var nodes = this.nodes;
            var i, imax;
            for (i = 0, imax = nodes.length; i < imax; ++i) {
                nodes[i].postMessage(message);
            }
            return this;
        };

        $.process = function(tickID) {
            var _ = this._;
            if (this.tickID !== tickID) {
                this.tickID = tickID;
                if (_.ar) {
                    fn.inputSignalAR(this);
                    fn.outputSignalAR(this);
                } else {
                    this.cells[0][0] = fn.inputSignalKR(this);
                    fn.outputSignalKR(this);
                }
            }
            return this;
        };

        return ArrayWrapper;
    })();

    var ObjectWrapper = (function() {
        function ObjectWrapper(_args) {
            TimbreObject.call(this, 1, []);
            fn.fixKR(this);

            if (isDictionary(_args[1])) {
                var params = _args[1];
                this.once("init", function() {
                    this.set(params);
                });
            }
        }
        fn.extend(ObjectWrapper);

        var $ = ObjectWrapper.prototype;

        Object.defineProperties($, {

        });

        return ObjectWrapper;
    })();

    var SystemInlet = (function() {
        function SystemInlet(object) {
            TimbreObject.call(this, 2, []);

            this.playbackState = FINISHED_STATE;
            var _ = this._;
            _.node = object;
            _.onplay  = make_onplay(this);
            _.onpause = make_onpause(this);
        }
        fn.extend(SystemInlet);

        var make_onplay = function(self) {
            return function() {
                if (_sys.inlets.indexOf(self) === -1) {
                    _sys.inlets.push(self);
                    _sys.events.emit("addObject");
                    self.playbackState = PLAYING_STATE;
                    self._.emit("play");
                }
            };
        };

        var make_onpause = function(self) {
            return function() {
                var i = _sys.inlets.indexOf(self);
                if (i !== -1) {
                    _sys.inlets.splice(i, 1);
                    self.playbackState = FINISHED_STATE;
                    self._.emit("pause");
                    _sys.events.emit("removeObject");
                }
            };
        };

        var $ = SystemInlet.prototype;

        $.play = function() {
            _sys.nextTick(this._.onplay);
            return (_sys.inlets.indexOf(this) === -1);
        };

        $.pause = function() {
            _sys.nextTick(this._.onpause);
        };

        $.process = function(tickID) {
            var node = this._.node;
            if (node.playbackState & 1) {
                node.process(tickID);
                this.cells[1].set(node.cells[1]);
                this.cells[2].set(node.cells[2]);
            } else {
                this.cells[1].set(fn.emptycell);
                this.cells[2].set(fn.emptycell);
            }
        };

        return SystemInlet;
    })();

    var SoundSystem = (function() {
        function SoundSystem() {
            this.context = this;
            this.tickID = 0;
            this.impl = null;
            this.amp  = 0.8;
            this.status = FINISHED_STATE;
            this.samplerate = 44100;
            this.channels   = 2;
            this.cellsize   = 64;
            this.streammsec = 20;
            this.streamsize = 0;
            this.currentTime = 0;
            this.nextTicks = [];
            this.inlets    = [];
            this.timers    = [];
            this.listeners = [];

            this.deferred = null;
            this.recStart   = 0;
            this.recBuffers = null;
            this.delayProcess = make_delayProcess(this);

            this.events = null;

            fn.currentTimeIncr = this.cellsize * 1000 / this.samplerate;
            fn.emptycell = new fn.SignalArray(this.cellsize);

            this.reset(true);
        }

        var make_delayProcess = function(self) {
            return function() {
                self.recStart = Date.now();
                self.process();
            };
        };

        var $ = SoundSystem.prototype;

        $.bind = function(Klass, opts) {
            if (typeof Klass === "function") {
                var player = new Klass(this, opts);
                this.impl = player;
                if (this.impl.defaultSamplerate) {
                    this.samplerate = this.impl.defaultSamplerate;
                }
            }
            return this;
        };

        $.setup = function(params) {
            if (typeof params === "object") {
                if (ACCEPT_SAMPLERATES.indexOf(params.samplerate) !== -1) {
                    if (params.samplerate <= this.impl.maxSamplerate) {
                        this.samplerate = params.samplerate;
                    } else {
                        this.samplerate = this.impl.maxSamplerate;
                    }
                }
                if (ACCEPT_CELLSIZES.indexOf(params.cellsize) !== -1) {
                    this.cellsize = params.cellsize;
                }
                if (typeof Float64Array !== "undefined" && typeof params.f64 !== "undefined") {
                    _f64mode = !!params.f64;
                    if (_f64mode) {
                        fn.SignalArray = Float64Array;
                    } else {
                        fn.SignalArray = Float32Array;
                    }
                }
            }
            fn.currentTimeIncr = this.cellsize * 1000 / this.samplerate;
            fn.emptycell = new fn.SignalArray(this.cellsize);
            return this;
        };

        $.getAdjustSamples = function(samplerate) {
            var samples, bits;
            samplerate = samplerate || this.samplerate;
            samples = this.streammsec / 1000 * samplerate;
            bits = Math.ceil(Math.log(samples) * Math.LOG2E);
            bits = (bits < 8) ? 8 : (bits > 14) ? 14 : bits;
            return 1 << bits;
        };

        $.play = function() {
            if (this.status === FINISHED_STATE) {
                this.status = PLAYING_STATE;

                this.streamsize = this.getAdjustSamples();
                this.strmL = new fn.SignalArray(this.streamsize);
                this.strmR = new fn.SignalArray(this.streamsize);

                this.impl.play();
                this.events.emit("play");
            }
            return this;
        };

        $.pause = function() {
            if (this.status === PLAYING_STATE) {
                this.status = FINISHED_STATE;
                this.impl.pause();
                this.events.emit("pause");
            }
            return this;
        };

        $.reset = function(deep) {
            if (deep) {
                this.events = new EventEmitter(this).on("addObject", function() {
                    if (this.status === FINISHED_STATE) {
                        this.play();
                    }
                }).on("removeObject", function() {
                    if (this.status === PLAYING_STATE) {
                        if (this.inlets.length + this.timers.length + this.listeners.length === 0) {
                            this.pause();
                        }
                    }
                });
            }
            this.currentTime = 0;
            this.nextTicks = [];
            this.inlets    = [];
            this.timers    = [];
            this.listeners = [];
            return this;
        };

        $.process = function() {
            var tickID = this.tickID;
            var strmL = this.strmL, strmR = this.strmR;
            var amp = this.amp;
            var x, tmpL, tmpR;
            var i, imax = this.streamsize, saved_i = 0;
            var j, jmax;
            var k, kmax = this.cellsize;
            var n = this.streamsize / this.cellsize;
            var nextTicks;
            var timers    = this.timers;
            var inlets    = this.inlets;
            var listeners = this.listeners;
            var currentTimeIncr = fn.currentTimeIncr;

            for (i = 0; i < imax; ++i) {
                strmL[i] = strmR[i] = 0;
            }

            while (n--) {
                ++tickID;

                for (j = 0, jmax = timers.length; j < jmax; ++j) {
                    if (timers[j].playbackState & 1) {
                        timers[j].process(tickID);
                    }
                }

                for (j = 0, jmax = inlets.length; j < jmax; ++j) {
                    x = inlets[j];
                    x.process(tickID);
                    if (x.playbackState & 1) {
                        tmpL = x.cells[1];
                        tmpR = x.cells[2];
                        for (k = 0, i = saved_i; k < kmax; ++k, ++i) {
                            strmL[i] += tmpL[k];
                            strmR[i] += tmpR[k];
                        }
                    }
                }
                saved_i += kmax;

                for (j = 0, jmax = listeners.length; j < jmax; ++j) {
                    if (listeners[j].playbackState & 1) {
                        listeners[j].process(tickID);
                    }
                }

                this.currentTime += currentTimeIncr;

                nextTicks = this.nextTicks.splice(0);
                for (j = 0, jmax = nextTicks.length; j < jmax; ++j) {
                    nextTicks[j]();
                }
            }

            for (i = 0; i < imax; ++i) {
                x = strmL[i] * amp;
                if (x < -1) {
                    x = -1;
                } else if (x > 1) {
                    x = 1;
                }
                strmL[i] = x;
                x = strmR[i] * amp;
                if (x < -1) {
                    x = -1;
                } else if (x > 1) {
                    x = 1;
                }
                strmR[i] = x;
            }

            this.tickID = tickID;

            var currentTime = this.currentTime;

            if (this.status === SCHEDULED_STATE) {
                if (this.recCh === 2) {
                    this.recBuffers.push(new fn.SignalArray(strmL));
                    this.recBuffers.push(new fn.SignalArray(strmR));
                } else {
                    var strm = new fn.SignalArray(strmL.length);
                    for (i = 0, imax = strm.length; i < imax; ++i) {
                        strm[i] = (strmL[i] + strmR[i]) * 0.5;
                    }
                    this.recBuffers.push(strm);
                }

                if (currentTime >= this.maxDuration) {
                    this.deferred.sub.reject();
                } else if (currentTime >= this.recDuration) {
                    this.deferred.sub.resolve();
                } else {
                    var now = Date.now();
                    if ((now - this.recStart) > 20) {
                        setTimeout(this.delayProcess, 10);
                    } else {
                        this.process();
                    }
                }
            }
        };

        $.nextTick = function(func) {
            if (this.status === FINISHED_STATE) {
                func();
            } else {
                this.nextTicks.push(func);
            }
        };

        $.rec = function() {
            fn.fix_iOS6_1_problem(true);

            var dfd = new Deferred(this);

            if (this.deferred) {
                console.warn("rec deferred is exists??");
                return dfd.reject().promise();
            }

            if (this.status !== FINISHED_STATE) {
                console.log("status is not none", this.status);
                return dfd.reject().promise();
            }

            var i = 0, args = arguments;
            var opts = isDictionary(args[i]) ? args[i++] : {};
            var func = args[i];

            if (typeof func !== "function") {
                // throw error??
                console.warn("no function");
                return dfd.reject().promise();
            }

            this.deferred = dfd;
            this.status = SCHEDULED_STATE;
            this.reset();

            var rec_inlet = new T("+");
            var inlet_dfd = new Deferred(this);

            var outlet = {
                done: function() {
                    inlet_dfd.resolve.apply(inlet_dfd, slice.call(arguments));
                },
                send: function() {
                    rec_inlet.append.apply(rec_inlet, arguments);
                }
            };

            var self = this;
            inlet_dfd.then(recdone, function() {
                fn.fix_iOS6_1_problem(false);
                recdone.call(self, true);
            });

            this.deferred.sub = inlet_dfd;

            this.savedSamplerate = this.samplerate;
            this.samplerate  = opts.samplerate  || this.samplerate;
            this.recDuration = opts.recDuration || Infinity;
            this.maxDuration = opts.maxDuration || 10 * 60 * 1000;
            this.recCh = opts.ch || 1;
            if (this.recCh !== 2) {
                this.recCh = 1;
            }
            this.recBuffers = [];

            this.streamsize = this.getAdjustSamples();
            this.strmL = new fn.SignalArray(this.streamsize);
            this.strmR = new fn.SignalArray(this.streamsize);

            this.inlets.push(rec_inlet);

            func(outlet);

            setTimeout(this.delayProcess, 10);

            return dfd.promise();
        };

        var recdone = function() {
            this.status = FINISHED_STATE;
            this.reset();

            var recBuffers = this.recBuffers;
            var samplerate = this.samplerate;
            var streamsize = this.streamsize;
            var bufferLength;

            this.samplerate = this.savedSamplerate;

            if (this.recDuration !== Infinity) {
                bufferLength = (this.recDuration * samplerate * 0.001)|0;
            } else {
                bufferLength = (recBuffers.length >> (this.recCh-1)) * streamsize;
            }

            var result;
            var i, imax = (bufferLength / streamsize)|0;
            var j = 0, k = 0;
            var remaining = bufferLength;

            if (this.recCh === 2) {
                var L = new fn.SignalArray(bufferLength);
                var R = new fn.SignalArray(bufferLength);
                var mixed = new fn.SignalArray(bufferLength);

                for (i = 0; i < imax; ++i) {
                    L.set(recBuffers[j++], k);
                    R.set(recBuffers[j++], k);
                    k += streamsize;
                    remaining -= streamsize;
                    if (remaining > 0 && remaining < streamsize) {
                        L.set(recBuffers[j++].subarray(0, remaining), k);
                        R.set(recBuffers[j++].subarray(0, remaining), k);
                        break;
                    }
                }
                for (i = 0, imax = bufferLength; i < imax; ++i) {
                    mixed[i] = (L[i] + R[i]) * 0.5;
                }

                result = {
                    samplerate: samplerate,
                    channels  : 2,
                    buffer: [mixed, L, R]
                };

            } else {
                var buffer = new fn.SignalArray(bufferLength);
                for (i = 0; i < imax; ++i) {
                    buffer.set(recBuffers[j++], k);
                    k += streamsize;
                    remaining -= streamsize;
                    if (remaining > 0 && remaining < streamsize) {
                        buffer.set(recBuffers[j++].subarray(0, remaining), k);
                        break;
                    }
                }
                result = {
                    samplerate: samplerate,
                    channels  : 1,
                    buffer: [buffer]
                };
            }

            var args = [].concat.apply([result], arguments);
            this.deferred.resolve.apply(this.deferred, args);
            this.deferred = null;
        };

        // EventEmitter
        $.on = function(type, listeners) {
            this.events.on(type, listeners);
        };
        $.once = function(type, listeners) {
            this.events.once(type, listeners);
        };
        $.off = function(type, listener) {
            this.events.off(type, listener);
        };
        $.removeAllListeners = function(type) {
            this.events.removeListeners(type);
        };
        $.listeners = function(type) {
            return this.events.listeners(type);
        };

        $.fix_iOS6_1_problem = function(flag) {
            if (this.impl.fix_iOS6_1_problem) {
                this.impl.fix_iOS6_1_problem(flag);
            }
        };

        return SoundSystem;
    })();

    // player
    var ImplClass = null;
    /*global webkitAudioContext:true */
    if (typeof webkitAudioContext !== "undefined") {
        ImplClass = function(sys) {
            var context = new webkitAudioContext();
            var bufSrc, jsNode;

            fn._audioContext = context;

            this.maxSamplerate     = context.sampleRate;
            this.defaultSamplerate = context.sampleRate;
            this.env = "webkit";

            var ua = navigator.userAgent;
            if (ua.match(/linux/i)) {
                sys.streammsec *= 8;
            } else if (ua.match(/win(dows)?\s*(nt 5\.1|xp)/i)) {
                sys.streammsec *= 4;
            }

            this.play = function() {
                var onaudioprocess;
                var jsn_streamsize = sys.getAdjustSamples(context.sampleRate);
                var sys_streamsize = sys.streamsize;
                var x, dx;

                if (sys.samplerate === context.sampleRate) {
                    onaudioprocess = function(e) {
                        var outs = e.outputBuffer;
                        sys.process();
                        outs.getChannelData(0).set(sys.strmL);
                        outs.getChannelData(1).set(sys.strmR);
                    };
                } else if (sys.samplerate * 2 === context.sampleRate) {
                    onaudioprocess = function(e) {
                        var inL = sys.strmL;
                        var inR = sys.strmR;
                        var outs = e.outputBuffer;
                        var outL = outs.getChannelData(0);
                        var outR = outs.getChannelData(1);
                        var i, imax = outs.length;
                        var j;

                        sys.process();
                        for (i = j = 0; i < imax; i += 2, ++j) {
                            outL[i] = outL[i+1] = inL[j];
                            outR[i] = outR[i+1] = inR[j];
                        }
                    };
                } else {
                    x  = sys_streamsize;
                    dx = sys.samplerate / context.sampleRate;
                    onaudioprocess = function(e) {
                        var inL = sys.strmL;
                        var inR = sys.strmR;
                        var outs = e.outputBuffer;
                        var outL = outs.getChannelData(0);
                        var outR = outs.getChannelData(1);
                        var i, imax = outs.length;

                        for (i = 0; i < imax; ++i) {
                            if (x >= sys_streamsize) {
                                sys.process();
                                x -= sys_streamsize;
                            }
                            outL[i] = inL[x|0];
                            outR[i] = inR[x|0];
                            x += dx;
                        }
                    };
                }

                bufSrc = context.createBufferSource();
                jsNode = context.createJavaScriptNode(jsn_streamsize, 2, sys.channels);
                jsNode.onaudioprocess = onaudioprocess;
                bufSrc.noteOn(0);
                bufSrc.connect(jsNode);
                jsNode.connect(context.destination);
            };

            this.pause = function() {
                bufSrc.disconnect();
                jsNode.disconnect();
            };

            if (_envmobile) {
                var n   = 0;
                var buf = context.createBufferSource();
                this.fix_iOS6_1_problem = function(flag) {
                    n += flag ? 1 : -1;
                    if (n === 1) {
                        buf.noteOn(0);
                        buf.connect(context.destination);
                    } else if (n === 0) {
                        buf.disconnect();
                    }
                };
            }
        };
    } else if (typeof Audio === "function" &&
               typeof (new Audio()).mozSetup === "function") {
        ImplClass = function(sys) {
            /*global URL:true */
            var timer = (function() {
                var source = "var t=0;onmessage=function(e){if(t)t=clearInterval(t),0;if(typeof e.data=='number'&&e.data>0)t=setInterval(function(){postMessage(0);},e.data);};";
                var blob = new Blob([source], {type:"text/javascript"});
                var path = URL.createObjectURL(blob);
                return new Worker(path);
            })();
            /*global URL:false */

            this.maxSamplerate     = 48000;
            this.defaultSamplerate = 44100;
            this.env = "moz";

            this.play = function() {
                var audio = new Audio();
                var interleaved = new Float32Array(sys.streamsize * sys.channels);
                var streammsec  = sys.streammsec;
                var written     = 0;
                var writtenIncr = sys.streamsize / sys.samplerate * 1000;
                var start = Date.now();

                var onaudioprocess = function() {
                    if (written > Date.now() - start) {
                        return;
                    }
                    var inL = sys.strmL;
                    var inR = sys.strmR;
                    var i = interleaved.length;
                    var j = inL.length;
                    sys.process();
                    while (j--) {
                        interleaved[--i] = inR[j];
                        interleaved[--i] = inL[j];
                    }
                    audio.mozWriteAudio(interleaved);
                    written += writtenIncr;
                };

                audio.mozSetup(sys.channels, sys.samplerate);
                timer.onmessage = onaudioprocess;
                timer.postMessage(streammsec);
            };

            this.pause = function() {
                timer.postMessage(0);
            };
        };
    } else {
        ImplClass = function(sys) {
            this.maxSamplerate     = 48000;
            this.defaultSamplerate = 44100;
            this.env = "nop";
            this.play  = function() {};
            this.pause = function() {};
        };
    }
    /*global webkitAudioContext:false */

    _sys = new SoundSystem().bind(ImplClass);

    var exports = timbre;

    if (_envtype === "node") {
        module.exports = global.timbre = exports;
    } else if (_envtype === "browser") {
        exports.noConflict = (function() {
           var _t = window.timbre, _T = window.T;
            return function(deep) {
                if (window.T === exports) {
                    window.T = _T;
                }
                if (deep && window.timbre === exports) {
                    window.timbre = _t;
                }
                return exports;
            };
        })();

        window.timbre = window.T = exports;
    }

    // Flash fallback
    (function() {
        if (_sys.impl.env !== "nop" || _envtype !== "browser" || _envmobile) {
            return;
        }
        var nav = navigator;

        /*jshint latedef:true */
        if (getFlashPlayerVersion(0) < 10) {
            return;
        }
        /*jshint latedef:false */

        var swf, PlayerDivID = "TimbreFlashPlayerDiv";
        var src = (function() {
            var scripts = document.getElementsByTagName("script");
            if (scripts && scripts.length) {
                for (var m, i = 0, imax = scripts.length; i < imax; ++i) {
                    if ((m = /^(.*\/)timbre(?:\.dev)?\.js$/i.exec(scripts[i].src))) {
                        return m[1] + "timbre.swf";
                    }
                }
            }
        })();

        window.timbrejs_flashfallback_init = function() {
            function TimbreFlashPlayer(sys) {
                var timerId = 0;

                this.maxSamplerate     = 44100;
                this.defaultSamplerate = 44100;
                this.env = "flash";

                this.play = function() {
                    var onaudioprocess;
                    var interleaved = new Array(sys.streamsize * sys.channels);
                    var streammsec  = sys.streammsec;
                    var written = 0;
                    var writtenIncr = sys.streamsize / sys.samplerate * 1000;
                    var start = Date.now();

                    onaudioprocess = function() {
                        if (written > Date.now() - start) {
                            return;
                        }
                        var inL = sys.strmL;
                        var inR = sys.strmR;
                        var i = interleaved.length;
                        var j = inL.length;
                        sys.process();
                        while (j--) {
                            interleaved[--i] = (inR[j] * 32768)|0;
                            interleaved[--i] = (inL[j] * 32768)|0;
                        }
                        swf.writeAudio(interleaved.join(" "));
                        written += writtenIncr;
                    };

                    if (swf.setup) {
                        swf.setup(sys.channels, sys.samplerate);
                        timerId = setInterval(onaudioprocess, streammsec);
                    } else {
                        console.warn("Cannot find " + src);
                    }
                };

                this.pause = function() {
                    if (timerId !== 0) {
                        swf.cancel();
                        clearInterval(timerId);
                        timerId = 0;
                    }
                };
            }
            _sys.bind(TimbreFlashPlayer);
            delete window.timbrejs_flashfallback_init;
        };

        var o, p;
        var swfSrc  = src;
        var swfName = swfSrc + "?" + (+new Date());
        var swfId   = "TimbreFlashPlayer";
        var div = document.createElement("div");
        div.id = PlayerDivID;
        div.style.display = "inline";
        div.width = div.height = 1;

        if (nav.plugins && nav.mimeTypes && nav.mimeTypes.length) {
            // ns
            o = document.createElement("object");
            o.id = swfId;
            o.classid = "clsid:D27CDB6E-AE6D-11cf-96B8-444553540000";
            o.width = o.height = 1;
            o.setAttribute("data", swfName);
            o.setAttribute("type", "application/x-shockwave-flash");
            p = document.createElement("param");
            p.setAttribute("name", "allowScriptAccess");
            p.setAttribute("value", "always");
            o.appendChild(p);
            div.appendChild(o);
        } else {
            // ie
            /*jshint quotmark:single */
            div.innerHTML = '<object id="' + swfId + '" classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000" width="1" height="1"><param name="movie" value="' + swfName + '" /><param name="bgcolor" value="#FFFFFF" /><param name="quality" value="high" /><param name="allowScriptAccess" value="always" /></object>';
            /*jshint quotmark:double */
        }
        window.addEventListener("load", function() {
            document.body.appendChild(div);
            swf = document[swfId];
        });

        function getFlashPlayerVersion(subs) {
            /*global ActiveXObject:true */
            try {
                if (nav.plugins && nav.mimeTypes && nav.mimeTypes.length) {
                    return nav.plugins["Shockwave Flash"].description.match(/([0-9]+)/)[subs];
                }
                return (new ActiveXObject("ShockwaveFlash.ShockwaveFlash")).GetVariable("$version").match(/([0-9]+)/)[subs];
            } catch (e) {
                return -1;
            }
            /*global ActiveXObject:false */
        }
    })();

    function setupTypedArray() {
        var unsigned = 0, signed = 1, floating  = 2;

        function ArrayBuffer(_) {
            var a = new Array(_.byteLength);
            var bytes = _.BYTES_PER_ELEMENT, shift;
            for (var i = 0, imax = a.length; i < imax; ++i) {
                shift = (i % bytes) * 8;
                a[i] = (_[(i / bytes)|0] & (0x0FF << shift)) >>> shift;
            }
            a.__view = _;
            return a;
        }

        function TypedArray(klass, arg, offset, length) {
            var a, b, bytes, i, imax;
            if (Array.isArray(arg)) {
                if (arg.__view) {
                    if (typeof offset === "undefined") {
                        offset = 0;
                    }
                    if (typeof length === "undefined") {
                        length = arg.length - offset;
                    }
                    bytes = klass.bytes;
                    if (klass.type === floating) {
                        a = arg.__view.slice((offset/bytes)|0, ((offset+length)/bytes)|0);
                    } else {
                        b = arg.slice(offset, offset + length);
                        a = new Array((b.length / bytes)|0);
                        for (i = 0, imax = a.length; i < imax; ++i) {
                            a[i] = 0;
                        }
                        for (i = 0, imax = b.length; i < imax; ++i) {
                            a[(i/bytes)|0] += (b[i] & 0xFF) << ((i % bytes) * 8);
                        }
                    }
                } else {
                    a = arg.slice();
                }
            } else if (typeof arg === "number" && arg > 0) {
                a = new Array(arg|0);
            } else {
                a = [];
            }
            if (klass.type !== floating) {
                for (i = 0, imax = a.length; i < imax; ++i) {
                    a[i] = (+a[i] || 0) & ((1 << (2 * 8)) - 1);
                }
            } else {
                for (i = 0, imax = a.length; i < imax; ++i) {
                    a[i] = a[i] || 0;
                }
            }
            if (klass.type === signed) {
                for (i = 0, imax = a.length; i < imax; ++i) {
                    if (a[i] & (1 << ((bytes * 8) - 1))) {
                        a[i] -= 1 << (bytes * 8);
                    }
                }
            }

            a.__klass  = klass;
            a.constructor = window[klass.name];
            a.set      = set;
            a.subarray = subarray;
            a.BYTES_PER_ELEMENT = klass.bytes;
            a.byteLength = klass.bytes * a.length;
            a.byteOffset = offset || 0;
            Object.defineProperty(a, "buffer", {
                get: function() {
                    return new ArrayBuffer(this);
                }
            });
            return a;
        }
        var set = function(array, offset) {
            if (typeof offset === "undefined") {
                offset = 0;
            }
            var i, imax = Math.min(this.length - offset, array.length);
            for (i = 0; i < imax; ++i) {
                this[offset + i] = array[i];
            }
        };
        var subarray = function(begin, end) {
            if (typeof end === "undefined") {
                end = this.length;
            }
            return new this.constructor(this.slice(begin, end));
        };
        [["Int8Array" , 1, signed], ["Uint8Array" , 1, unsigned],
         ["Int16Array", 2, signed], ["Uint16Array", 2, unsigned],
         ["Int32Array", 4, signed], ["Uint32Array", 4, unsigned],
         ["Float32Array", 4, floating], ["Float64Array", 8, floating]
        ].forEach(function(_params) {
            var name = _params[0];
            var params = { bytes:_params[1], type:_params[2], name:name };
            window[name] = function(arg, offset, length) {
                return TypedArray.call(this, params, arg, offset, length);
            };
        });
    }
})();
(function(T) {
    "use strict";

    function Envelope(samplerate) {
        this.samplerate = samplerate || 44100;
        this.value  = ZERO;
        this.status = StatusWait;
        this.curve  = "linear";
        this.step   = 1;
        this.releaseNode = null;
        this.loopNode    = null;
        this.emit = null;

        this._envValue = new EnvelopeValue(samplerate);

        this._table  = [];
        this._initValue  = ZERO;
        this._curveValue = 0;
        this._defaultCurveType = CurveTypeLin;
        this._index   = 0;
        this._counter = 0;
    }

    var ZERO           = Envelope.ZERO = 1e-6;
    var CurveTypeSet   = Envelope.CurveTypeSet   = 0;
    var CurveTypeLin   = Envelope.CurveTypeLin   = 1;
    var CurveTypeExp   = Envelope.CurveTypeExp   = 2;
    var CurveTypeSin   = Envelope.CurveTypeSin   = 3;
    var CurveTypeWel   = Envelope.CurveTypeWel   = 4;
    var CurveTypeCurve = Envelope.CurveTypeCurve = 5;
    var CurveTypeSqr   = Envelope.CurveTypeSqr   = 6;
    var CurveTypeCub   = Envelope.CurveTypeCub   = 7;

    var StatusWait    = Envelope.StatusWait    = 0;
    var StatusGate    = Envelope.StatusGate    = 1;
    var StatusSustain = Envelope.StatusSustain = 2;
    var StatusRelease = Envelope.StatusRelease = 3;
    var StatusEnd     = Envelope.StatusEnd     = 4;

    var CurveTypeDict = {
        set:CurveTypeSet,
        lin:CurveTypeLin, linear     :CurveTypeLin,
        exp:CurveTypeExp, exponential:CurveTypeExp,
        sin:CurveTypeSin, sine       :CurveTypeSin,
        wel:CurveTypeWel, welch      :CurveTypeWel,
        sqr:CurveTypeSqr, squared    :CurveTypeSqr,
        cub:CurveTypeCub, cubed      :CurveTypeCub
    };
    Envelope.CurveTypeDict = CurveTypeDict;

    var $ = Envelope.prototype;

    $.clone = function() {
        var new_instance = new Envelope(this.samplerate);
        new_instance._table = this._table;
        new_instance._initValue = this._initValue;
        new_instance.setCurve(this.curve);
        if (this.releaseNode !== null) {
            new_instance.setReleaseNode(this.releaseNode + 1);
        }
        if (this.loopNode !== null) {
            new_instance.setLoopNode(this.loopNode + 1);
        }
        new_instance.setStep(this.step);
        new_instance.reset();
        return new_instance;
    };
    $.setTable = function(value) {
        this._initValue = value[0];
        this._table = value.slice(1);
        this.value = this._envValue.value = this._initValue;
        this._index   = 0;
        this._counter = 0;
        this.status = StatusWait;
    };
    $.setCurve = function(value) {
        if (typeof value === "number")  {
            this._defaultCurveType = CurveTypeCurve;
            this._curveValue = value;
            this.curve = value;
        } else {
            this._defaultCurveType = CurveTypeDict[value] || null;
            this.curve = value;
        }
    };
    $.setReleaseNode = function(value) {
        if (typeof value === "number" && value > 0) {
            this.releaseNode = value - 1;
        }
    };
    $.setLoopNode = function(value) {
        if (typeof value === "number" && value > 0) {
            this.loopNode = value - 1;
        }
    };
    $.setStep = function(step) {
        this.step = this._envValue.step = step;
    };
    $.reset = function() {
        this.value = this._envValue.value = this._initValue;
        this._index   = 0;
        this._counter = 0;
        this.status = StatusWait;
    };
    $.release = function() {
        if (this.releaseNode !== null) {
            this._counter = 0;
            this.status = StatusRelease;
        }
    };
    $.getInfo = function(sustainTime) {
        var table = this._table;
        var i, imax;
        var totalDuration    = 0;
        var loopBeginTime    = Infinity;
        var releaseBeginTime = Infinity;
        var isEndlessLoop    = false;
        for (i = 0, imax = table.length; i < imax; ++i) {
            if (this.loopNode === i) {
                loopBeginTime = totalDuration;
            }
            if (this.releaseNode === i) {
                if (totalDuration < sustainTime) {
                    totalDuration += sustainTime;
                } else {
                    totalDuration  = sustainTime;
                }
                releaseBeginTime = totalDuration;
            }

            var items = table[i];
            if (Array.isArray(items)) {
                totalDuration += items[1];
            }
        }
        if (loopBeginTime !== Infinity && releaseBeginTime === Infinity) {
            totalDuration += sustainTime;
            isEndlessLoop = true;
        }

        return {
            totalDuration   : totalDuration,
            loopBeginTime   : loopBeginTime,
            releaseBeginTime: releaseBeginTime,
            isEndlessLoop   : isEndlessLoop
        };
    };

    $.calcStatus = function() {
        var status  = this.status;
        var table   = this._table;
        var index   = this._index;
        var counter = this._counter;

        var curveValue = this._curveValue;
        var defaultCurveType = this._defaultCurveType;
        var loopNode    = this.loopNode;
        var releaseNode = this.releaseNode;
        var envValue = this._envValue;
        var items, endValue, time, curveType, emit = null;

        switch (status) {
        case StatusWait:
        case StatusEnd:
            break;
        case StatusGate:
        case StatusRelease:
            while (counter <= 0) {
                if (index >= table.length) {
                    if (status === StatusGate && loopNode !== null) {
                        index = loopNode;
                        continue;
                    }
                    status    = StatusEnd;
                    counter   = Infinity;
                    curveType = CurveTypeSet;
                    emit      = "ended";
                    continue;
                } else if (status === StatusGate && index === releaseNode) {
                    if (loopNode !== null && loopNode < releaseNode) {
                        index = loopNode;
                        continue;
                    }
                    status    = StatusSustain;
                    counter   = Infinity;
                    curveType = CurveTypeSet;
                    emit      = "sustained";
                    continue;
                }
                items = table[index++];

                endValue = items[0];
                if (items[2] === null) {
                    curveType = defaultCurveType;
                } else {
                    curveType = items[2];
                }
                if (curveType === CurveTypeCurve) {
                    curveValue = items[3];
                    if (Math.abs(curveValue) < 0.001) {
                        curveType = CurveTypeLin;
                    }
                }
                time = items[1];

                counter = envValue.setNext(endValue, time, curveType, curveValue);
            }
            break;
        }

        this.status = status;
        this.emit   = emit;
        this._index = index;
        this._counter = counter;

        return status;
    };

    $.next = function() {
        if (this.calcStatus() & 1) {
            this.value  = this._envValue.next() || ZERO;
        }
        this._counter -= 1;
        return this.value;
    };

    $.process = function(cell) {
        var envValue = this._envValue;
        var i, imax = cell.length;

        if (this.calcStatus() & 1) {
            for (i = 0; i < imax; ++i) {
                cell[i] = envValue.next() || ZERO;
            }
        } else {
            var value = this.value || ZERO;
            for (i = 0; i < imax; ++i) {
                cell[i] = value;
            }
        }
        this.value = cell[imax-1];

        this._counter -= cell.length;
    };


    function EnvelopeValue(samplerate) {
        this.samplerate = samplerate;
        this.value = ZERO;
        this.step  = 1;

        this._curveType  = CurveTypeLin;
        this._curveValue = 0;

        this._grow = 0;

        this._a2 = 0;
        this._b1 = 0;
        this._y1 = 0;
        this._y2 = 0;
    }
    EnvelopeValue.prototype.setNext = function(endValue, time, curveType, curveValue) {
        var n = this.step;
        var value = this.value;
        var grow, w, a1, a2, b1, y1, y2;

        var counter = ((time * 0.001 * this.samplerate) / n)|0;
        if (counter < 1) {
            counter   = 1;
            curveType = CurveTypeSet;
        }

        switch (curveType) {
        case CurveTypeSet:
            this.value = endValue;
            break;
        case CurveTypeLin:
            grow = (endValue - value) / counter;
            break;
        case CurveTypeExp:
            if (value !== 0) {
                grow = Math.pow(
                    endValue / value, 1 / counter
                );
            } else {
                grow = 0;
            }
            break;
        case CurveTypeSin:
            w = Math.PI / counter;
            a2 = (endValue + value) * 0.5;
            b1 = 2 * Math.cos(w);
            y1 = (endValue - value) * 0.5;
            y2 = y1 * Math.sin(Math.PI * 0.5 - w);
            value = a2 - y1;
            break;
        case CurveTypeWel:
            w = (Math.PI * 0.5) / counter;
            b1 = 2 * Math.cos(w);
            if (endValue >= value) {
                a2 = value;
                y1 = 0;
                y2 = -Math.sin(w) * (endValue - value);
            } else {
                a2 = endValue;
                y1 = value - endValue;
                y2 = Math.cos(w) * (value - endValue);
            }
            value = a2 + y1;
            break;
        case CurveTypeCurve:
            a1 = (endValue - value) / (1.0 - Math.exp(curveValue));
            a2 = value + a1;
            b1 = a1;
            grow = Math.exp(curveValue / counter);
            break;
        case CurveTypeSqr:
            y1 = Math.sqrt(value);
            y2 = Math.sqrt(endValue);
            grow = (y2 - y1) / counter;
            break;
        case CurveTypeCub:
            y1 = Math.pow(value   , 0.33333333);
            y2 = Math.pow(endValue, 0.33333333);
            grow = (y2 - y1) / counter;
            break;
        }

        this.next = NextFunctions[curveType];
        this._grow = grow;
        this._a2 = a2;
        this._b1 = b1;
        this._y1 = y1;
        this._y2 = y2;

        return counter;
    };

    var NextFunctions = [];
    NextFunctions[CurveTypeSet] = function() {
        return this.value;
    };
    NextFunctions[CurveTypeLin] = function() {
        this.value += this._grow;
        return this.value;
    };
    NextFunctions[CurveTypeExp] = function() {
        this.value *= this._grow;
        return this.value;
    };
    NextFunctions[CurveTypeSin] = function() {
        var y0 = this._b1 * this._y1 - this._y2;
        this.value = this._a2 - y0;
        this._y2 = this._y1;
        this._y1 = y0;
        return this.value;
    };
    NextFunctions[CurveTypeWel] = function() {
        var y0 = this._b1 * this._y1 - this._y2;
        this.value = this._a2 + y0;
        this._y2 = this._y1;
        this._y1 = y0;
        return this.value;
    };
    NextFunctions[CurveTypeCurve] = function() {
        this._b1 *= this._grow;
        this.value = this._a2 - this._b1;
        return this.value;
    };
    NextFunctions[CurveTypeSqr] = function() {
        this._y1 += this._grow;
        this.value = this._y1 * this._y1;
        return this.value;
    };
    NextFunctions[CurveTypeCub] = function() {
        this._y1 += this._grow;
        this.value = this._y1 * this._y1 * this._y1;
        return this.value;
    };

    EnvelopeValue.prototype.next = NextFunctions[CurveTypeSet];

    T.modules.Envelope      = Envelope;
    T.modules.EnvelopeValue = EnvelopeValue;

})(timbre);
(function(T) {
    "use strict";

    function Oscillator(samplerate) {
        this.samplerate = samplerate || 44100;

        this.wave = null;
        this.step = 1;
        this.frequency = 0;
        this.value = 0;
        this.phase = 0;
        this.feedback = false;

        this._x = 0;
        this._lastouts = 0;
        this._coeff = TABLE_SIZE / this.samplerate;
        this._radtoinc = TABLE_SIZE / (Math.PI * 2);
    }

    var TABLE_SIZE = 1024;
    var TABLE_MASK = TABLE_SIZE - 1;

    var $ = Oscillator.prototype;

    $.setWave = function(value) {
        var i, dx, wave = this.wave;
        if (!this.wave) {
            this.wave = new Float32Array(TABLE_SIZE + 1);
        }
        if (typeof value === "function") {
            for (i = 0; i < TABLE_SIZE; ++i) {
                wave[i] = value(i / TABLE_SIZE);
            }
        } else if (T.fn.isSignalArray(value)) {
            if (value.length === wave.length) {
                wave.set(value);
            } else {
                dx = value.length / TABLE_SIZE;
                for (i = 0; i < TABLE_SIZE; ++i) {
                    wave[i] = value[(i * dx)|0];
                }
            }
        } else if (typeof value === "string") {
            if ((dx = getWavetable(value)) !== undefined) {
                this.wave.set(dx);
            }
        }
        this.wave[TABLE_SIZE] = this.wave[0];
    };

    $.clone = function() {
        var new_instance = new Oscillator(this.samplerate);
        new_instance.wave      = this.wave;
        new_instance.step      = this.step;
        new_instance.frequency = this.frequency;
        new_instance.value     = this.value;
        new_instance.phase     = this.phase;
        new_instance.feedback  = this.feedback;
        return new_instance;
    };

    $.reset = function() {
        this._x = 0;
    };

    $.next = function() {
        var x = this._x;
        var index = (x + this.phase * this._radtoinc)|0;
        this.value = this.wave[index & TABLE_MASK];
        x += this.frequency * this._coeff * this.step;
        if (x > TABLE_SIZE) {
            x -= TABLE_SIZE;
        }
        this._x = x;
        return this.value;
    };

    $.process = function(cell) {
        var wave = this.wave;
        var radtoinc = this._radtoinc;
        var phase, x = this._x;
        var index, frac, x0, x1, dx = this.frequency * this._coeff;
        var i, imax = this.step;

        if (this.feedback) {
            var lastouts = this._lastouts;
            radtoinc *= this.phase;
            for (i = 0; i < imax; ++i) {
                phase = x + lastouts * radtoinc;
                index = phase|0;
                frac  = phase - index;
                index = index & TABLE_MASK;
                x0 = wave[index  ];
                x1 = wave[index+1];
                cell[i] = lastouts = x0 + frac * (x1 - x0);
                x += dx;
            }
            this._lastouts = lastouts;
        } else {
            var phaseoffset = this.phase * radtoinc;
            for (i = 0; i < imax; ++i) {
                phase = x + phaseoffset;
                index = phase|0;
                frac  = phase - index;
                index = index & TABLE_MASK;
                x0 = wave[index  ];
                x1 = wave[index+1];
                cell[i] = x0 + frac * (x1 - x0);
                x += dx;
            }
        }
        if (x > TABLE_SIZE) {
            x -= TABLE_SIZE;
        }
        this._x = x;
        this.value = cell[cell.length - 1];
    };

    $.processWithFreqArray = function(cell, freqs) {
        var wave = this.wave;
        var radtoinc = this._radtoinc;
        var phase, x = this._x;
        var index, frac, x0, x1, dx = this._coeff;
        var i, imax = this.step;

        if (this.feedback) {
            var lastouts = this._lastouts;
            radtoinc *= this.phase;
            for (i = 0; i < imax; ++i) {
                phase = x + lastouts * radtoinc;
                index = phase|0;
                frac  = phase - index;
                index = index & TABLE_MASK;
                x0 = wave[index  ];
                x1 = wave[index+1];
                cell[i] = lastouts = x0 + frac * (x1 - x0);
                x += freqs[i] * dx;
            }
            this._lastouts = lastouts;
        } else {
            var phaseoffset = this.phase * this._radtoinc;
            for (i = 0; i < imax; ++i) {
                phase = x + phaseoffset;
                index = phase|0;
                frac  = phase - index;
                index = index & TABLE_MASK;
                x0 = wave[index  ];
                x1 = wave[index+1];
                cell[i] = x0 + frac * (x1 - x0);
                x += freqs[i] * dx;
            }
        }
        if (x > TABLE_SIZE) {
            x -= TABLE_SIZE;
        }
        this._x = x;
        this.value = cell[cell.length - 1];
    };

    $.processWithPhaseArray = function(cell, phases) {
        var wave = this.wave;
        var radtoinc = this._radtoinc;
        var phase, x = this._x;
        var index, frac, x0, x1, dx = this.frequency * this._coeff;
        var i, imax = this.step;

        if (this.feedback) {
            var lastouts = this._lastouts;
            radtoinc *= this.phase;
            for (i = 0; i < imax; ++i) {
                phase = x + lastouts * radtoinc;
                index = phase|0;
                frac  = phase - index;
                index = index & TABLE_MASK;
                x0 = wave[index  ];
                x1 = wave[index+1];
                cell[i] = lastouts = x0 + frac * (x1 - x0);
                x += dx;
            }
            this._lastouts = lastouts;
        } else {
            for (i = 0; i < imax; ++i) {
                phase = x + phases[i] * radtoinc;
                index = phase|0;
                frac  = phase - index;
                index = index & TABLE_MASK;
                x0 = wave[index  ];
                x1 = wave[index+1];
                cell[i] = x0 + frac * (x1 - x0);
                x += dx;
            }
        }
        if (x > TABLE_SIZE) {
            x -= TABLE_SIZE;
        }
        this._x = x;
        this.value = cell[cell.length - 1];
    };

    $.processWithFreqAndPhaseArray = function(cell, freqs, phases) {
        var wave = this.wave;
        var radtoinc = this._radtoinc;
        var phase, x = this._x;
        var index, frac, x0, x1, dx = this._coeff;
        var i, imax = this.step;

        if (this.feedback) {
            var lastouts = this._lastouts;
            radtoinc *= this.phase;
            for (i = 0; i < imax; ++i) {
                phase = x + lastouts * radtoinc;
                index = phase|0;
                frac  = phase - index;
                index = index & TABLE_MASK;
                x0 = wave[index  ];
                x1 = wave[index+1];
                cell[i] = lastouts = x0 + frac * (x1 - x0);
                x += freqs[i] * dx;
            }
            this._lastouts = lastouts;
        } else {
            for (i = 0; i < imax; ++i) {
                phase = x + phases[i] * TABLE_SIZE;
                index = phase|0;
                frac  = phase - index;
                index = index & TABLE_MASK;
                x0 = wave[index  ];
                x1 = wave[index+1];
                cell[i] = x0 + frac * (x1 - x0);
                x += freqs[i] * dx;
            }
        }
        if (x > TABLE_SIZE) {
            x -= TABLE_SIZE;
        }
        this._x = x;
        this.value = cell[cell.length - 1];
    };


    function waveshape(sign, name, shape, width) {
        var wave = Wavetables[name];
        var _wave;
        var i, imax, j, jmax;

        if (wave === undefined) {
            return;
        }

        if (typeof wave === "function") {
            wave = wave();
        }

        switch (shape) {
        case "@1":
            for (i = 512; i < 1024; ++i) {
                wave[i] = 0;
            }
            break;
        case "@2":
            for (i = 512; i < 1024; ++i) {
                wave[i] = Math.abs(wave[i]);
            }
            break;
        case "@3":
            for (i = 256; i <  512; ++i) {
                wave[i] = 0;
            }
            for (i = 512; i <  768; ++i) {
                wave[i] = Math.abs(wave[i]);
            }
            for (i = 768; i < 1024; ++i) {
                wave[i] = 0;
            }
            break;
        case "@4":
            _wave = new Float32Array(1024);
            for (i = 0; i < 512; ++i) {
                _wave[i] = wave[i<<1];
            }
            wave = _wave;
            break;
        case "@5":
            _wave = new Float32Array(1024);
            for (i = 0; i < 512; ++i) {
                _wave[i] = Math.abs(wave[i<<1]);
            }
            wave = _wave;
            break;
        }

        // duty-cycle
        if (width !== undefined && width !== 50) {
            width *= 0.01;
            width = (width < 0) ? 0 : (width > 1) ? 1 : width;

            _wave = new Float32Array(1024);
            imax = (1024 * width)|0;
            for (i = 0; i < imax; ++i) {
                _wave[i] = wave[(i / imax * 512)|0];
            }
            jmax = (1024 - imax);
            for (j = 0; i < 1024; ++i, ++j) {
                _wave[i] = wave[(j / jmax * 512 + 512)|0];
            }
            wave = _wave;
        }

        if (sign === "+") {
            for (i = 0; i < 1024; ++i) {
                wave[i] = wave[i] * 0.5 + 0.5;
            }
        } else if (sign === "-") {
            for (i = 0; i < 1024; ++i) {
                wave[i] *= -1;
            }
        }
        return wave;
    }

    function wavb(src) {
        var wave = new Float32Array(1024);
        var n = src.length >> 1;
        if ([2,4,8,16,32,64,128,256,512,1024].indexOf(n) !== -1) {

            for (var i = 0, k = 0; i < n; ++i) {
                var x = parseInt(src.substr(i * 2, 2), 16);

                x = (x & 0x80) ? (x-256) / 128.0 : x / 127.0;
                for (var j = 0, jmax = 1024 / n; j < jmax; ++j) {
                    wave[k++] = x;
                }
            }
        }
        return wave;
    }

    function wavc(src) {
        var wave = new Float32Array(1024);
        if (src.length === 8) {
            var color = parseInt(src, 16);
            var bar   = new Float32Array(8);
            var i, j;

            bar[0] = 1;
            for (i = 0; i < 7; ++i) {
                bar[i+1] = (color & 0x0f) * 0.0625; // 0.0625 = 1/16
                color >>= 4;
            }

            for (i = 0; i < 8; ++i) {
                var x = 0, dx = (i + 1) / 1024;
                for (j = 0; j < 1024; ++j) {
                    wave[j] += Math.sin(2 * Math.PI * x) * bar[i];
                    x += dx;
                }
            }

            var maxx = 0, absx;
            for (i = 0; i < 1024; ++i) {
                if (maxx < (absx = Math.abs(wave[i]))) {
                    maxx = absx;
                }
            }
            if (maxx > 0) {
                for (i = 0; i < 1024; ++i) {
                    wave[i] /= maxx;
                }
            }
        }
        return wave;
    }

    var getWavetable = function(key) {
        var wave = Wavetables[key];
        if (wave !== undefined) {
            if (typeof wave === "function") {
                wave = wave();
            }
            return wave;
        }

        var m;
        // wave shaping
        m = /^([\-+]?)(\w+)(?:\((@[0-7])?:?(\d+)?\))?$/.exec(key);
        if (m !== null) {
            var sign = m[1], name = m[2], shape = m[3], width = m[4];
            wave = waveshape(sign, name, shape, width);
            if (wave !== undefined) {
                Wavetables[key] = wave;
                return wave;
            }
        }

        // wave bytes
        m = /^wavb\(((?:[0-9a-fA-F][0-9a-fA-F])+)\)$/.exec(key);
        if (m !== null) {
            return wavb(m[1]);
        }

        // wave color
        m = /^wavc\(([0-9a-fA-F]{8})\)$/.exec(key);
        if (m !== null) {
            return wavc(m[1]);
        }

        // warn message
    };
    Oscillator.getWavetable = getWavetable;

    var setWavetable = function(name, value) {
        var dx, wave = new Float32Array(1024);
        var i;
        if (typeof value === "function") {
            for (i = 0; i < 1024; ++i) {
                wave[i] = value(i / 1024);
            }
        } else if (T.fn.isSignalArray(value)) {
            if (value.length === wave.length) {
                wave.set(value);
            } else {
                dx = value.length / 1024;
                for (i = 0; i < 1024; ++i) {
                    wave[i] = value[(i * dx)|0];
                }
            }
        }
        Wavetables[name] = wave;
    };
    Oscillator.setWavetable = setWavetable;

    var Wavetables = {
        sin: function() {
            var wave = new Float32Array(1024);
            for (var i = 0; i < 1024; ++i) {
                wave[i] = Math.sin(2 * Math.PI * (i/1024));
            }
            return wave;
        },
        cos: function() {
            var wave = new Float32Array(1024);
            for (var i = 0; i < 1024; ++i) {
                wave[i] = Math.cos(2 * Math.PI * (i/1024));
            }
            return wave;
        },
        pulse: function() {
            var wave = new Float32Array(1024);
            for (var i = 0; i < 1024; ++i) {
                wave[i] = (i < 512) ? +1 : -1;
            }
            return wave;
        },
        tri: function() {
            var wave = new Float32Array(1024);
            for (var x, i = 0; i < 1024; ++i) {
                x = (i / 1024) - 0.25;
                wave[i] = 1.0 - 4.0 * Math.abs(Math.round(x) - x);
            }
            return wave;
        },
        saw: function() {
            var wave = new Float32Array(1024);
            for (var x, i = 0; i < 1024; ++i) {
                x = (i / 1024);
                wave[i] = +2.0 * (x - Math.round(x));
            }
            return wave;
        },
        fami: function() {
            var d = [ +0.000, +0.125, +0.250, +0.375, +0.500, +0.625, +0.750, +0.875,
                      +0.875, +0.750, +0.625, +0.500, +0.375, +0.250, +0.125, +0.000,
                      -0.125, -0.250, -0.375, -0.500, -0.625, -0.750, -0.875, -1.000,
                      -1.000, -0.875, -0.750, -0.625, -0.500, -0.375, -0.250, -0.125 ];
            var wave = new Float32Array(1024);
            for (var i = 0; i < 1024; ++i) {
                wave[i] = d[(i / 1024 * d.length)|0];
            }
            return wave;
        },
        konami: function() {
            var d = [-0.625, -0.875, -0.125, +0.750, + 0.500, +0.125, +0.500, +0.750,
                     +0.250, -0.125, +0.500, +0.875, + 0.625, +0.000, +0.250, +0.375,
                     -0.125, -0.750, +0.000, +0.625, + 0.125, -0.500, -0.375, -0.125,
                     -0.750, -1.000, -0.625, +0.000, - 0.375, -0.875, -0.625, -0.250 ];
            var wave = new Float32Array(1024);
            for (var i = 0; i < 1024; ++i) {
                wave[i] = d[(i / 1024 * d.length)|0];
            }
            return wave;
        }
    };

    T.modules.Oscillator = Oscillator;

})(timbre);
(function(T) {
    "use strict";

    var fn = T.fn;
    var timevalue = T.timevalue;
    var Envelope  = T.modules.Envelope;
    var isDictionary = fn.isDictionary;

    function EnvNode(_args) {
        T.Object.call(this, 2, _args);
        var _ = this._;
        _.env = new Envelope(_.samplerate);
        _.env.setStep(_.cellsize);
        _.tmp = new fn.SignalArray(_.cellsize);
        _.ar = false;
        _.plotFlush = true;
        _.onended = make_onended(this);
        this.on("ar", onar);
    }
    fn.extend(EnvNode);

    var onar = function(value) {
        this._.env.setStep((value) ? 1 : this._.cellsize);
    };

    var make_onended = function(self) {
        return function() {
            self._.emit("ended");
        };
    };

    var $ = EnvNode.prototype;

    Object.defineProperties($, {
        table: {
            set: function(value) {
                if (Array.isArray(value)) {
                    setTable.call(this, value);
                    this._.plotFlush = true;
                }
            },
            get: function() {
                return this._.env.table;
            }
        },
        curve: {
            set: function(value) {
                this._.env.setCurve(value);
            },
            get: function() {
                return this._.env.curve;
            }
        },
        releaseNode: {
            set: function(value) {
                this._.env.setReleaseNode(value);
                this._.plotFlush = true;
            },
            get: function() {
                return this._.env.releaseNode + 1;
            }
        },
        loopNode: {
            set: function(value) {
                this._.env.setLoopNode(value);
                this._.plotFlush = true;
            },
            get: function() {
                return this._.env.loopNode + 1;
            }
        }
    });

    $.clone = function() {
        var instance = fn.clone(this);
        instance._.env = this._.env.clone();
        return instance;
    };

    $.reset = function() {
        this._.env.reset();
        return this;
    };

    $.release = function() {
        var _ = this._;
        _.env.release();
        _.emit("released");
        return this;
    };

    $.bang = function() {
        var _ = this._;
        _.env.reset();
        _.env.status = Envelope.StatusGate;
        _.emit("bang");
        return this;
    };

    $.process = function(tickID) {
        var _ = this._;

        if (this.tickID !== tickID) {
            this.tickID = tickID;

            var cellL = this.cells[1];
            var cellR = this.cells[2];
            var i, imax = _.cellsize;

            if (this.nodes.length) {
                fn.inputSignalAR(this);
            } else {
                for (i = 0; i < imax; ++i) {
                    cellL[i] = cellR[i] = 1;
                }
            }

            var value, emit = null;
            if (_.ar) {
                var tmp = _.tmp;
                _.env.process(tmp);
                for (i = 0; i < imax; ++i) {
                    cellL[i] *= tmp[i];
                    cellR[i] *= tmp[i];
                }
                emit = _.env.emit;
            } else {
                value = _.env.next();
                for (i = 0; i < imax; ++i) {
                    cellL[i] *= value;
                    cellR[i] *= value;
                }
                emit = _.env.emit;
            }

            fn.outputSignalAR(this);

            if (emit) {
                if (emit === "ended") {
                    fn.nextTick(_.onended);
                } else {
                    this._.emit(emit, _.value);
                }
            }
        }

        return this;
    };

    var setTable = function(list) {
        var env = this._.env;

        var table = [list[0] || ZERO];

        var value, time, curveType, curveValue;
        for (var i = 1, imax = list.length; i < imax; ++i) {
            value = list[i][0] || ZERO;
            time  = list[i][1];
            curveType = list[i][2];

            if (typeof time !== "number") {
                if (typeof time === "string") {
                    time = timevalue(time);
                } else {
                    time = 10;
                }
            }
            if (time < 10) {
                time = 10;
            }

            if (typeof curveType === "number") {
                curveValue = curveType;
                curveType  = Envelope.CurveTypeCurve;
            } else {
                curveType  = Envelope.CurveTypeDict[curveType] || null;
                curveValue = 0;
            }
            table.push([value, time, curveType, curveValue]);
        }

        env.setTable(table);
    };

    var super_plot = T.Object.prototype.plot;

    $.plot = function(opts) {
        if (this._.plotFlush) {
            var env = this._.env.clone();
            var info = env.getInfo(1000);

            var totalDuration    = info.totalDuration;
            var loopBeginTime    = info.loopBeginTime;
            var releaseBeginTime = info.releaseBeginTime;
            var data = new Float32Array(256);
            var duration = 0;
            var durationIncr = totalDuration / data.length;
            var isReleased   = false;
            var samples = (totalDuration * 0.001 * this._.samplerate)|0;
            var i, imax;

            samples /= data.length;
            env.setStep(samples);
            env.status = Envelope.StatusGate;
            for (i = 0, imax = data.length; i < imax; ++i) {
                data[i] = env.next();
                duration += durationIncr;
                if (!isReleased && duration >= releaseBeginTime) {
                    env.release();
                    isReleased = true;
                }
            }
            this._.plotData = data;

            this._.plotBefore = function(context, x, y, width, height) {
                var x1, w;
                if (loopBeginTime !== Infinity && releaseBeginTime !== Infinity) {
                    x1 = x + (width * (loopBeginTime    / totalDuration));
                    w  = x + (width * (releaseBeginTime / totalDuration));
                    w  = w - x1;
                    context.fillStyle = "rgba(224, 224, 224, 0.8)";
                    context.fillRect(x1, 0, w, height);
                }
                if (releaseBeginTime !== Infinity) {
                    x1 = x + (width * (releaseBeginTime / totalDuration));
                    w  = width - x1;
                    context.fillStyle = "rgba(212, 212, 212, 0.8)";
                    context.fillRect(x1, 0, w, height);
                }
            };

            // y-range
            var minValue = Infinity, maxValue = -Infinity;
            for (i = 0; i < imax; ++i) {
                if (data[i] < minValue) {
                    minValue = data[i];
                } else if (data[i] > maxValue) {
                    maxValue = data[i];
                }
            }
            if (maxValue < 1) {
                maxValue = 1;
            }
            this._.plotRange = [minValue, maxValue];

            this._.plotData  = data;
            this._.plotFlush = null;
        }
        return super_plot.call(this, opts);
    };
    fn.register("env", EnvNode);


    function envValue(opts, min, def, name1, name2, func) {
        var x = def;
        if (typeof opts[name1] === "number") {
            x = opts[name1];
        } else if (typeof opts[name2] === "number") {
            x = opts[name2];
        } else if (func) {
            if (typeof opts[name1] === "string") {
                x = func(opts[name1]);
            } else if (typeof opts[name2] === "string") {
                x = func(opts[name2]);
            }
        }
        if (x < min) {
            x = min;
        }
        return x;
    }

    var ZERO = Envelope.ZERO;

    fn.register("perc", function(_args) {
        if (!isDictionary(_args[0])) {
            _args.unshift({});
        }

        var opts = _args[0];
        var a  = envValue(opts,   10,   10, "a" , "attackTime" , timevalue);
        var r  = envValue(opts,   10, 1000, "r" , "releaseTime", timevalue);
        var lv = envValue(opts, ZERO,    1, "lv", "level"     );

        opts.table = [ZERO, [lv, a], [ZERO, r]];

        return new EnvNode(_args);
    });

    fn.register("adsr", function(_args) {
        if (!isDictionary(_args[0])) {
            _args.unshift({});
        }

        var opts = _args[0];
        var a  = envValue(opts,   10,   10, "a" , "attackTime"  , timevalue);
        var d  = envValue(opts,   10,  300, "d" , "decayTime"   , timevalue);
        var s  = envValue(opts, ZERO,  0.5, "s" , "sustainLevel");
        var r  = envValue(opts,   10, 1000, "r" , "decayTime"   , timevalue);
        var lv = envValue(opts, ZERO,    1, "lv", "level"       );

        opts.table = [ZERO, [lv, a], [s, d], [ZERO, r]];
        opts.releaseNode = 3;

        return new EnvNode(_args);
    });

    fn.register("adshr", function(_args) {
        if (!isDictionary(_args[0])) {
            _args.unshift({});
        }

        var opts = _args[0];
        var a  = envValue(opts,   10,   10, "a" , "attackTime"  , timevalue);
        var d  = envValue(opts,   10,  300, "d" , "decayTime"   , timevalue);
        var s  = envValue(opts, ZERO,  0.5, "s" , "sustainLevel");
        var h  = envValue(opts,   10,  500, "h" , "holdTime"    , timevalue);
        var r  = envValue(opts,   10, 1000, "r" , "decayTime"   , timevalue);
        var lv = envValue(opts, ZERO,    1, "lv", "level"       );

        opts.table = [ZERO, [lv, a], [s, d], [s, h], [ZERO, r]];

        return new EnvNode(_args);
    });

    fn.register("asr", function(_args) {
        if (!isDictionary(_args[0])) {
            _args.unshift({});
        }

        var opts = _args[0];
        var a  = envValue(opts,   10,   10, "a" , "attackTime"  , timevalue);
        var s  = envValue(opts, ZERO,  0.5, "s" , "sustainLevel");
        var r  = envValue(opts,   10, 1000, "r" , "releaseTime" , timevalue);

        opts.table = [ZERO, [s, a], [ZERO, r]];
        opts.releaseNode = 2;

        return new EnvNode(_args);
    });

    fn.register("dadsr", function(_args) {
        if (!isDictionary(_args[0])) {
            _args.unshift({});
        }

        var opts = _args[0];
        var dl = envValue(opts,   10,  100, "dl", "delayTime"   , timevalue);
        var a  = envValue(opts,   10,   10, "a" , "attackTime"  , timevalue);
        var d  = envValue(opts,   10,  300, "d" , "decayTime"   , timevalue);
        var s  = envValue(opts, ZERO,  0.5, "s" , "sustainLevel");
        var r  = envValue(opts,   10, 1000, "r" , "relaseTime"  , timevalue);
        var lv = envValue(opts, ZERO,    1, "lv", "level"       );

        opts.table = [ZERO, [ZERO, dl], [lv, a], [s, d], [ZERO, r]];
        opts.releaseNode = 4;

        return new EnvNode(_args);
    });

    fn.register("ahdsfr", function(_args) {
        if (!isDictionary(_args[0])) {
            _args.unshift({});
        }

        var opts = _args[0];
        var a  = envValue(opts,   10,   10, "a" , "attackTime"  , timevalue);
        var h  = envValue(opts,   10,   10, "h" , "holdTime"    , timevalue);
        var d  = envValue(opts,   10,  300, "d" , "decayTime"   , timevalue);
        var s  = envValue(opts, ZERO,  0.5, "s" , "sustainLevel");
        var f  = envValue(opts,   10, 5000, "f" , "fadeTime"    , timevalue);
        var r  = envValue(opts,   10, 1000, "r" , "relaseTime"  , timevalue);
        var lv = envValue(opts, ZERO,    1, "lv", "level"       );

        opts.table = [ZERO, [lv, a], [lv, h], [s, d], [ZERO, f], [ZERO, r]];
        opts.releaseNode = 5;

        return new EnvNode(_args);
    });

    fn.register("linen", function(_args) {
        if (!isDictionary(_args[0])) {
            _args.unshift({});
        }

        var opts = _args[0];
        var a  = envValue(opts,   10,   10, "a" , "attackTime" , timevalue);
        var s  = envValue(opts,   10, 1000, "s" , "sustainTime", timevalue);
        var r  = envValue(opts,   10, 1000, "r" , "releaseTime", timevalue);
        var lv = envValue(opts, ZERO,    1, "lv", "level"      );

        opts.table = [ZERO, [lv, a], [lv, s], [ZERO, r]];

        return new EnvNode(_args);
    });

    fn.register("env.tri", function(_args) {
        if (!isDictionary(_args[0])) {
            _args.unshift({});
        }

        var opts = _args[0];
        var dur = envValue(opts,   20, 1000, "dur", "duration", timevalue);
        var lv  = envValue(opts, ZERO,    1, "lv" , "level"   );

        dur *= 0.5;
        opts.table = [ZERO, [lv, dur], [ZERO, dur]];

        return new EnvNode(_args);
    });

    fn.register("env.cutoff", function(_args) {
        if (!isDictionary(_args[0])) {
            _args.unshift({});
        }

        var opts = _args[0];
        var r  = envValue(opts,   10, 100, "r" , "relaseTime", timevalue);
        var lv = envValue(opts, ZERO,   1, "lv", "level"    );

        opts.table = [lv, [ZERO, r]];

        return new EnvNode(_args);
    });

})(timbre);
(function(T) {
    "use strict";

    var fn = T.fn;
    var timevalue  = T.timevalue;
    var Oscillator = T.modules.Oscillator;

    function OscNode(_args) {
        T.Object.call(this, 2, _args);

        var _ = this._;
        _.freq  = T(440);
        _.phase = T(0);
        _.osc = new Oscillator(_.samplerate);
        _.tmp = new fn.SignalArray(_.cellsize);
        _.osc.step = _.cellsize;

        this.once("init", oninit);
    }
    fn.extend(OscNode);

    var oninit = function() {
        var _ = this._;
        if (!this.wave) {
            this.wave = "sin";
        }
        _.plotData = _.osc.wave;
        _.plotLineWidth = 2;
        _.plotCyclic = true;
        _.plotBefore = plotBefore;
    };

    var $ = OscNode.prototype;

    Object.defineProperties($, {
        wave: {
            set: function(value) {
                this._.osc.setWave(value);
            },
            get: function() {
                return this._.osc.wave;
            }
        },
        freq: {
            set: function(value) {
                if (typeof value === "string") {
                    value = timevalue(value);
                    if (value <= 0) {
                        value = 0;
                    } else {
                        value = 1000 / value;
                    }
                }
                this._.freq = T(value);
            },
            get: function() {
                return this._.freq;
            }
        },
        phase: {
            set: function(value) {
                this._.phase = T(value);
                this._.osc.feedback = false;
            },
            get: function() {
                return this._.phase;
            }
        },
        fb: {
            set: function(value) {
                this._.phase = T(value);
                this._.osc.feedback = true;
            },
            get: function() {
                return this._.phase;
            }
        }
    });

    $.clone = function() {
        var instance = fn.clone(this);
        instance._.osc = this._.osc.clone();
        instance._.freq  = this._.freq;
        instance._.phase = this._.phase;
        return instance;
    };

    $.bang = function() {
        this._.osc.reset();
        this._.emit("bang");
        return this;
    };

    $.process = function(tickID) {
        var _ = this._;

        if (this.tickID !== tickID) {
            this.tickID = tickID;

            var cellL = this.cells[1];
            var cellR = this.cells[2];
            var i, imax = _.cellsize;

            if (this.nodes.length) {
                fn.inputSignalAR(this);
            } else {
                for (i = 0; i < imax; ++i) {
                    cellL[i] = cellR[i] = 1;
                }
            }

            var osc = _.osc;
            var freq  = _.freq.process(tickID).cells[0];
            var phase = _.phase.process(tickID).cells[0];

            osc.frequency = freq[0];
            osc.phase     = phase[0];

            if (_.ar) {
                var tmp  = _.tmp;
                if (_.freq.isAr) {
                    if (_.phase.isAr) {
                        osc.processWithFreqAndPhaseArray(tmp, freq, phase);
                    } else {
                        osc.processWithFreqArray(tmp, freq);
                    }
                } else {
                    if (_.phase.isAr) {
                        osc.processWithPhaseArray(tmp, phase);
                    } else {
                        osc.process(tmp);
                    }
                }
                for (i = 0; i < imax; ++i) {
                    cellL[i] *= tmp[i];
                    cellR[i] *= tmp[i];
                }
            } else {
                var value = osc.next();
                for (i = 0; i < imax; ++i) {
                    cellL[i] *= value;
                    cellR[i] *= value;
                }
            }
            fn.outputSignalAR(this);
        }

        return this;
    };

    var plotBefore;
    if (T.envtype === "browser") {
        plotBefore = function(context, offset_x, offset_y, width, height) {
            var y = (height >> 1) + 0.5;
            context.strokeStyle = "#ccc";
            context.lineWidth   = 1;
            context.beginPath();
            context.moveTo(offset_x, y + offset_y);
            context.lineTo(offset_x + width, y + offset_y);
            context.stroke();
        };
    }

    fn.register("osc", OscNode);

    fn.register("sin", function(_args) {
        return new OscNode(_args).set("wave", "sin");
    });
    fn.register("cos", function(_args) {
        return new OscNode(_args).set("wave", "cos");
    });
    fn.register("pulse", function(_args) {
        return new OscNode(_args).set("wave", "pulse");
    });
    fn.register("tri", function(_args) {
        return new OscNode(_args).set("wave", "tri");
    });
    fn.register("saw", function(_args) {
        return new OscNode(_args).set("wave", "saw");
    });
    fn.register("fami", function(_args) {
        return new OscNode(_args).set("wave", "fami");
    });
    fn.register("konami", function(_args) {
        return new OscNode(_args).set("wave", "konami");
    });
    fn.register("+sin", function(_args) {
        return new OscNode(_args).set("wave", "+sin").kr();
    });
    fn.register("+pulse", function(_args) {
        return new OscNode(_args).set("wave", "+pulse").kr();
    });
    fn.register("+tri", function(_args) {
        return new OscNode(_args).set("wave", "+tri").kr();
    });
    fn.register("+saw", function(_args) {
        return new OscNode(_args).set("wave", "+saw").kr();
    });

    fn.alias("square", "pulse");

})(timbre);
(function(T) {
    "use strict";

    var fn = T.fn;
    var timevalue = T.timevalue;

    function ScheduleNode(_args) {
        T.Object.call(this, 0, _args);
        fn.timer(this);
        fn.fixKR(this);

        var _ = this._;
        _.queue = [];
        _.currentTime = 0;
        _.maxRemain   = 1000;
    }
    fn.extend(ScheduleNode);

    var $ = ScheduleNode.prototype;

    Object.defineProperties($, {
        queue: {
            get: function() {
                return this._.queue;
            }
        },
        remain: {
            get: function() {
                return this._.queue.length;
            }
        },
        maxRemain: {
            set: function(value) {
                if (typeof value === "number" && value > 0) {
                    this._.maxRemain = value;
                }
            },
            get: function() {
                return this._.maxRemain;
            }
        },
        isEmpty: {
            get: function() {
                return this._.queue.length === 0;
            }
        },
        currentTime: {
            get: function() {
                return this._.currentTime;
            }
        }
    });

    $.sched = function(delta, item, args) {
        if (typeof delta === "string") {
            delta = timevalue(delta);
        }
        if (typeof delta === "number") {
            this.schedAbs(this._.currentTime + delta, item, args);
        }
        return this;
    };

    $.schedAbs = function(time, item, args) {
        if (typeof time === "string") {
            time = timevalue(time);
        }
        if (typeof time === "number") {
            var _ = this._;
            var queue = _.queue;
            if (queue.length >= _.maxRemain) {
                return this;
            }
            for (var i = queue.length; i--; ) {
                if (queue[i][0] < time) {
                    break;
                }
            }
            queue.splice(i + 1, 0, [time, T(item), args]);
        }
        return this;
    };

    $.advance = function(delta) {
        if (typeof delta === "string") {
            delta = timevalue(delta);
        }
        if (typeof delta === "number") {
            this._.currentTime += delta;
        }
        return this;
    };

    $.clear = function() {
        this._.queue.splice(0);
        return this;
    };

    $.process = function(tickID) {
        var _ = this._;

        if (this.tickID !== tickID) {
            this.tickID = tickID;

            var emit = null;
            var queue = _.queue;

            if (queue.length) {
                while (queue[0][0] < _.currentTime) {
                    var nextItem = _.queue.shift();
                    nextItem[1].bang(nextItem[2]);
                    emit = "sched";
                    if (queue.length === 0) {
                        emit = "empty";
                        break;
                    }
                }
            }
            _.currentTime += fn.currentTimeIncr;
            if (emit) {
                _.emit(emit);
            }
        }
        return this;
    };

    fn.register("schedule", ScheduleNode);
    fn.alias("sched", "schedule");

})(timbre);
(function(T) {
    "use strict";

    var fn = T.fn;

    function SynthDefNode(_args) {
        T.Object.call(this, 2, _args);
        fn.fixAR(this);

        var _ = this._;
        this.playbackState = fn.FINISHED_STATE;
        _.poly     = 4;
        _.genList  = [];
        _.genDict  = {};
        _.synthdef = null;
        _.remGen = make_remGen(this);
        _.onended = fn.make_onended(this);
    }
    fn.extend(SynthDefNode);

    var $ = SynthDefNode.prototype;

    Object.defineProperties($, {
        def: {
            set: function(value) {
                if (typeof value === "function") {
                    this._.synthdef = value;
                }
            },
            get: function() {
                return this._.synthdef;
            }
        },
        poly: {
            set: function(value) {
                if (typeof value === "number") {
                    if (0 < value && value <= 64) {
                        this._.poly = value;
                    }
                }
            },
            get: function() {
                return this._.poly;
            }
        }
    });

    var make_doneAction = function(self, opts) {
        return function() {
            self._.remGen(opts.gen);
        };
    };

    var make_remGen = function(self) {
        return function(gen) {
            var _ = self._;
            var i = _.genList.indexOf(gen);
            if (i !== -1) {
                _.genList.splice(i, 1);
            }
            if (typeof gen.noteNum !== "undefined") {
                _.genDict[gen.noteNum] = null;
            }
        };
    };

    var noteOn = function(noteNum, freq, velocity, _opts) {
        velocity |= 0;
        if (velocity <= 0) {
            this.noteOff(this, noteNum);
        } else if (velocity > 127) {
            velocity = 127;
        }
        var _ = this._;
        var list = _.genList, dict = _.genDict;
        var gen = dict[noteNum];
        if (gen) {
            _.remGen(gen);
        }

        var opts = {
            freq    : freq,
            noteNum : noteNum,
            velocity: velocity,
            mul     : velocity * 0.0078125
        };
        if (_opts) {
            for (var key in _opts) {
                opts[key] = _opts[key];
            }
        }
        opts.doneAction = make_doneAction(this, opts);

        gen = _.synthdef.call(this, opts);

        if (gen instanceof T.Object) {
            gen.noteNum = noteNum;
            list.push(gen);
            dict[noteNum] = opts.gen = gen;

            this.playbackState = fn.PLAYING_STATE;

            if (list.length > _.poly) {
                _.remGen(list[0]);
            }
        }
    };

    var midicps = (function() {
        var table = new Float32Array(128);
        for (var i = 0; i < 128; ++i) {
            table[i] = 440 * Math.pow(2, (i - 69) * 1 / 12);
        }
        return table;
    })();

    var cpsmidi = function(cps) {
        if (cps > 0) {
            return Math.log(cps * 1 / 440) * Math.LOG2E * 12 + 69;
        } else {
            return 0;
        }
    };

    $.noteOn = function(noteNum, velocity, _opts) {
        var freq = midicps[noteNum] || (440 * Math.pow(2, (noteNum - 69) / 12));
        noteOn.call(this, (noteNum + 0.5)|0, freq, velocity, _opts);
        return this;
    };

    $.noteOff = function(noteNum) {
        var gen = this._.genDict[noteNum];
        if (gen && gen.release) {
            gen.release();
        }
        return this;
    };

    $.noteOnWithFreq = function(freq, velocity, _opts) {
        var noteNum = cpsmidi(freq);
        noteOn.call(this, (noteNum + 0.5)|0, freq, velocity, _opts);
        return this;
    };

    $.noteOffWithFreq = function(freq) {
        var noteNum = cpsmidi(freq);
        return this.noteOff((noteNum + 0.5)|0);
    };

    $.allNoteOff = function() {
        var list = this._.genList;
        for (var i = 0, imax = list.length; i < imax; ++i) {
            if (list[i].release) {
                list[i].release();
            }
        }
    };

    $.allSoundOff = function() {
        var _ = this._;
        var list = _.genList;
        var dict = _.genDict;
        while (list.length) {
            delete dict[list.shift().noteNum];
        }
    };

    $.synth = function(_opts) {
        var _ = this._;
        var list = _.genList;
        var gen, opts = {};

        if (_opts) {
            for (var key in _opts) {
                opts[key] = _opts[key];
            }
        }
        opts.doneAction = make_doneAction(this, opts);

        gen = _.synthdef.call(this, opts);

        if (gen instanceof T.Object) {
            list.push(gen);
            opts.gen = gen;
            this.playbackState = fn.PLAYING_STATE;

            if (list.length > _.poly) {
                _.remGen(list[0]);
            }
        }

        return this;
    };

    $.process = function(tickID) {
        var cell = this.cells[0];
        var _ = this._;

        if (this.tickID !== tickID) {
            this.tickID = tickID;

            if (this.playbackState === fn.PLAYING_STATE) {
                var list = _.genList;
                var gen;
                var cellL = this.cells[1];
                var cellR = this.cells[2];
                var i, imax;
                var j, jmax = cell.length;
                var tmpL, tmpR;

                if (list.length) {
                    gen = list[0];
                    gen.process(tickID);
                    cellL.set(gen.cells[1]);
                    cellR.set(gen.cells[2]);
                    for (i = 1, imax = list.length; i < imax; ++i) {
                        gen = list[i];
                        gen.process(tickID);
                        tmpL = gen.cells[1];
                        tmpR = gen.cells[2];
                        for (j = 0; j < jmax; ++j) {
                            cellL[j] += tmpL[j];
                            cellR[j] += tmpR[j];
                        }
                    }
                } else {
                    fn.nextTick(_.onended);
                }
            }

            fn.outputSignalAR(this);
        }

        return this;
    };

    fn.register("SynthDef", SynthDefNode);


    var env_desc = {
        set: function(value) {
            if (fn.isDictionary(value)) {
                if (typeof value.type === "string") {
                    this._.env = value;
                }
            } else if (value instanceof T.Object) {
                this._.env = value;
            }
        },
        get: function() {
            return this._.env;
        }
    };

    fn.register("OscGen", (function() {

        var osc_desc = {
            set: function(value) {
                if (value instanceof T.Object) {
                    this._.osc = value;
                }
            },
            get: function() {
                return this._.osc;
            }
        };

        var wave_desc = {
            set: function(value) {
                if (typeof value === "string") {
                    this._.wave = value;
                }
            },
            get: function() {
                return this._.wave;
            }
        };

        var synthdef = function(opts) {
            var _ = this._;
            var synth, osc, env, envtype;

            osc = _.osc || null;
            env = _.env || {};
            envtype = env.type || "perc";

            if (osc instanceof T.Object) {
                if (typeof osc.clone === "function") {
                    osc = osc.clone();
                }
            }
            if (!osc) {
                osc = T("osc", {wave:_.wave});
            }
            osc.freq = opts.freq;
            osc.mul  = osc.mul * opts.velocity/128;

            synth = osc;
            if (env instanceof T.Object) {
                if (typeof env.clone === "function") {
                    synth = env.clone().append(synth);
                }
            } else {
                synth = T(envtype, env, synth);
            }
            synth.on("ended", opts.doneAction).bang();

            return synth;
        };

        return function(_args) {
            var instance = new SynthDefNode(_args);

            instance._.wave = "sin";

            Object.defineProperties(instance, {
                env: env_desc, osc: osc_desc, wave: wave_desc
            });

            instance.def = synthdef;

            return instance;
        };
    })());

    fn.register("PluckGen", (function() {

        var synthdef = function(opts) {
            var _ = this._;
            var synth, env, envtype;

            env = _.env || {};
            envtype = env.type || "perc";

            synth = T("pluck", {freq:opts.freq, mul:opts.velocity/128}).bang();
            if (env instanceof T.Object) {
                if (typeof env.clone === "function") {
                    synth = env.clone().append(synth);
                }
            } else {
                synth = T(envtype, env, synth);
            }
            synth.on("ended", opts.doneAction).bang();

            return synth;
        };

        return function(_args) {
            var instance = new SynthDefNode(_args);

            Object.defineProperties(instance, {
                env: env_desc
            });

            instance.def = synthdef;

            return instance;
        };
    })());

})(timbre);
