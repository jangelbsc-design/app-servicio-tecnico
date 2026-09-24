(function() {
  if (window.__dismacFetchWatcherInstalled) return;
  window.__dismacFetchWatcherInstalled = true;

  var TRIGGER = [
    'SendAppointmentTechnical', 'ChangeStatus', 'WorkOrder/Update',
    'WorkOrder/Create', 'ReOpenWo', 'AddAppointment',
    'RescheduleAppointment', 'CreateScheduleSpecial', 'CompleteWorkShop'
  ];

  var orig = window.fetch;
  if (typeof orig !== 'function') return;

  window.fetch = function() {
    var input = arguments[0];
    var url = (input && typeof input === 'object' && input.url) ? input.url : String(input || '');
    return orig.apply(this, arguments).then(function(resp) {
      try {
        if (!TRIGGER.some(function(t) { return url.indexOf(t) !== -1; })) return resp;
        var clone = resp.clone();
        clone.text().then(function(text) {
          var body = null;
          try { body = JSON.parse(text); } catch (e) { body = text; }
          window.postMessage({ src: 'dismac-tidy-live', url: url, body: body }, '*');
        });
      } catch (e) {}
      return resp;
    });
  };
})();