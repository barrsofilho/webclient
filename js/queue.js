// cr@mega.co.nz
var DEFAULT_CONCURRENCY = 4

function MegaQueue(worker, limit) {
    this._limit = limit || 5;
	this._queue = [];
    this._running = 0
	this._worker  = worker
	this._noTaskCount = 0;
}
inherits(MegaQueue, MegaEvents)

MegaQueue.prototype.isEmpty = function() {
	return this._running == 0 
		&& this._queue.length == 0;
}

MegaQueue.prototype.pushFirst = function(arg, next, self) {
	if (d) {
		var found;
		for(var i in this._queue) {
			if(this._queue[i][0] == arg) {
				found = true;
				break;
			}
		}
		ASSERT(!found, 'Huh, that task already exists');
	}
	this._queue.unshift([arg, next || function _MQPushFirstVOID() {}, self || null]);
	this._process();
};

MegaQueue.prototype.resume = function() {
	this._paused = false;
	this._process();
	this.trigger('resume')
};

MegaQueue.prototype.shrink = function() {
	this._limit = Math.max(this._limit-1, 1);
	return this._limit;
}

MegaQueue.prototype.pause = function() {
	if (d) { console.log("pausing queue"); console.trace(); }
	this._paused = true;
	this.trigger('pause')
};

MegaQueue.prototype.isPaused = function() {
	return this._paused;
}

function _queue_checker(queue, tasks, next, error) {
	return function CCQueueChecker(task, response) {
		if (d > 1) console.error('** QC:', task, next, error);
		ASSERT(task, 'Invalid Task.');
		if (task) {
			var pos = $.inArray(task, tasks);
			ASSERT(pos != -1, 'Unknown task!?');
			if (pos != -1) tasks.splice(pos, 1);
		}
		if (response.length && response[0] === false) {
			/**
			 *	The first argument of .done(false) is false, which 
			 *	means that something went wrong
			 */
			return error(task, response);
		}
		if (tasks.length == 0) {
			if (d) ASSERT(queue.isEmpty(), 'The queue isnt empty');
			if (queue.isEmpty()) next();
		}
	};
};

MegaQueue.prototype.pushAll = function(tasks, next, error) {
	var i = 0
		, len = tasks.length
		, callback = _queue_checker(this, tasks, next, error)

	for (i=0; i < len; i++) {
		this.push(tasks[i], tasks[i].ric_cb = callback);
	}
};

MegaQueue.prototype.run_in_context = function(task) {
	this._running++;
	this._worker(task[0], function MQRicStub() {
		ASSERT(task[1], 'This should not be reached twice.');
		if (!task[1]) return; /* already called */
		this._running--;
		task[1].apply(task[2], [task[0], arguments]);
		task[0] = null;
		task[1] = null;
		task[2] = null;
		this._process();
	}.bind(this));
}

MegaQueue.prototype.validateTask = function() {
	return true;
}

MegaQueue.prototype.prepareNextTask = function() {
};

MegaQueue.prototype.getNextTask = function() {
	var i, len = this._queue.length
	this.prepareNextTask();
	for (i = 0; i < len; i++) {
		if (this.validateTask(this._queue[i][0])) {
			var data = this._queue[i]
			this._queue.splice(i, 1);
			return data
		}
	}
	return null;
};

MegaQueue.prototype.process = function() {
	var args;
	if (this._paused) return;
	clearTimeout(this._later);
	delete this._later;
	while (this._running < this._limit && this._queue.length > 0) {
		args = this.getNextTask();
		if (args === null) {
			if ( ++this._noTaskCount == 666 )
			{
				/**
				 * XXX: Prevent an infinite loop when there's a connection hang,
				 * with the UI reporting either "Temporary error; retrying" or
				 * a stalled % Status... [dc]
				 */
				if (d) console.error('*** CHECK THIS ***', this);
				this._noTaskCount = -1;
				return false;
			}
			this._process(1200);
			return false;
		}
		this._noTaskCount = 0;
		this.run_in_context(args);
		this.trigger('working', args);
	}

	if (this.isEmpty()) {
		this.trigger('drain');
	}
	return true;
};

MegaQueue.prototype.destroy = function() {
	clearTimeout(this._later);
	// this._limit = -1
	// this._queue = null;
	// this._queue = [];
	oDestroy(this);
}

MegaQueue.prototype._process = function(ms) {
	if (this._later) clearTimeout(this._later);
	this._later = setTimeout(this.process.bind(this), ms || 190);
};

MegaQueue.prototype.push = function(arg, next, self) {
    this._queue.push([arg, next || function _MQPushVOID() {}, self || null]);
	this.trigger('queue');
    this._process();
};
