(function(timbre) {
    "use strict";
    
    function Timer(_args) {
        timbre.Object.call(this, _args);
        timbre.fn.timer(this);
        timbre.fn.fixKR(this);
        
        this._.count = 0;
        this._.duration = Infinity;
        this._.currentTime = 0;
        this._.currentTimeIncr = timbre.cellsize * 1000 / timbre.samplerate;
        
        this._.delaySamples = 0;
        this._.countSamples = 0;
        this._.isEnded = false;
        
        this.once("init", oninit);
        this.on("start", onstart);
    }
    timbre.fn.extend(Timer, timbre.Object);
    
    var oninit = function() {
        if (!this._.interval) {
            this.interval = 1000;
        }
        if (this._.delay === undefined) {
            if (this._.originkey === "interval") {
                this.delay = this.interval.valueOf();
            } else {
                this.delay = 0;
            }
        }
    };
    
    var onstart = function() {
        this._.isEnded = false;
    };
    Object.defineProperty(onstart, "unremovable", {
        value:true, writable:false
    });
    
    var $ = Timer.prototype;
    
    Object.defineProperties($, {
        interval: {
            set: function(value) {
                this._.interval = timbre(value);
            },
            get: function() {
                return this._.interval;
            }
        },
        delay: {
            set: function(value) {
                if (typeof value === "number" && value >= 0) {
                    this._.delay = value;
                    this._.delaySamples = (timbre.samplerate * (value * 0.001))|0;
                }
            },
            get: function() {
                return this._.delay;
            }
        },
        count: {
            set: function(value) {
                if (typeof value === "number") {
                    this._.count = value;
                }
            },
            get: function() {
                return this._.count;
            }
        },
        duration: {
            set: function(value) {
                if (typeof value === "number" && value >= 0) {
                    this._.duration = value;
                }
            },
            get: function() {
                return this._.duration;
            }
        },
        currentTime: {
            get: function() {
                return this._.currentTime;
            }
        }
    });
    
    $.bang = function() {
        var _ = this._;
        _.delaySamples = (timbre.samplerate * (_.delay * 0.001))|0;
        _.countSamples = _.count = _.currentTime = 0;
        this._.emit("bang");
        return this;
    };
    
    $.seq = function(seq_id) {
        var cell = this.cell;
        
        var _ = this._;
        
        if (_.isEnded) {
            return cell;
        }
        
        if (this.seq_id !== seq_id) {
            this.seq_id = seq_id;
            
            if (_.delaySamples > 0) {
                _.delaySamples -= cell.length;
            }
            _.interval.seq(seq_id);
            
            if (_.delaySamples <= 0) {
                _.countSamples -= cell.length;
                if (_.countSamples <= 0) {
                    _.countSamples += (timbre.samplerate * _.interval.valueOf() * 0.001)|0;
                    var inputs = this.inputs;
                    var count  = _.count;
                    var x = count * _.mul + _.add;
                    for (var j = cell.length; j--; ) {
                        cell[j] = x;
                    }
                    for (var i = 0, imax = inputs.length; i < imax; ++i) {
                        inputs[i].bang(count);
                    }
                    _.count += 1;
                }
            }
            _.currentTime += _.currentTimeIncr;

            if (_.currentTime >= _.duration) {
                timbre.fn.nextTick(onended.bind(this));
            }
        }
        return cell;
    };
    
    var onended = function() {
        timbre.fn.onended(this);
    };
    
    timbre.fn.register("timer", Timer);
    timbre.fn.alias("interval", "timer");
    
    
    function timevalue(str) {
        var m, bpm, ticks;
        m = /^(\d+(?:\.\d+)?)Hz$/i.exec(str);
        if (m) {
            var hz = +m[1];
            if (hz === 0) {
                return 0;
            }
            return 1000 / +m[1];
        }
        m = /^bpm(\d+(?:\.\d+)?)\s*(?:l(\d+))?$/i.exec(str);
        if (m) {
            bpm = +m[1];
            var len = m[2] ? m[2]|0 : 4;
            if (bpm === 0 || len === 0) {
                return 0;
            }
            return 60 / bpm * (4 / len) * 1000;
        }
        m = /^bpm(\d+(?:\.\d+)?)\s*(?:(\d+)ticks)?$/i.exec(str);
        if (m) {
            bpm = +m[1];
            ticks = m[2] ? m[2]|0 : 480;
            if (bpm === 0) {
                return 0;
            }
            return 60 / bpm * (ticks / 480) * 1000;
        }
        m = /^bpm(\d+(?:\.\d+)?)\s*(\d+)\.(\d+)\.(\d+)$/i.exec(str);
        if (m) {
            bpm = +m[1];
            if (bpm === 0) {
                return 0;
            }
            var bars  = m[2]|0;
            var beats = m[3]|0;
            var units = m[4]|0;
            ticks = (bars * 4 * 480) + (beats * 480) + units;
            return 60 / bpm * (ticks / 480) * 1000;
        }
        m = /^(\d+)(?:ms)?$/i.exec(str);
        if (m) {
            return m[1]|0;
        }
        m = /^(\d+)samples(?:\/(\d+)Hz)?$/i.exec(str);
        if (m) {
            var sr = m[2] ? m[2]|0 : timbre.samplerate;
            if (sr === 0) {
                return 0;
            }
            return (m[1]|0) / sr * 1000;
        }
        m = /^(?:([0-5]?[0-9]):)?(?:([0-5]?[0-9]):)(?:([0-5]?[0-9]))(?:\.([0-9]{1,3}))?$/.exec(str);
        if (m) {
            var x = (m[1]|0) * 3600 + (m[2]|0) * 60 + (m[3]|0);
            x = x * 1000 + ((((m[4]||"")+"00").substr(0, 3))|0);
            return x;
        }
        
        return 0;
    }
    timbre.utils.timevalue = timevalue;
    
})(timbre);
