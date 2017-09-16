SignalK telemetry plugin.

This plugin is a generic telemetry plugin that supports multiple backends (currently CSV, InfluxDB and Carbon). 
It is desinged to work on low bandwidth, low resource platforms and so makes an effort not to 
saturate network links or consume resoruces. It subscribed to a cofigurable number of SignalK messages, 
aggregates them and emits them at regular intervals, regardless of the input rate. This avoids saturating
the output pathway with dupicate messages or messages that are too frequent. 

In the case of the CSV backend, one line is written per flush operation, files are rotated once per hour and 
each file contains the current set of headers. If the configuration changes a new header line is written.

In the case of the InfluxDB conenctor a single schema is emited with 1 message per flush operation. Flushes are
queued to be emitted as a batch at least once ever 30s or in batches of no more than 100 flushes whichever is sooner.
The flushes go over TCP to the influx DB server.

In the case of Carbon each flush is emitted containing all parameters over TCP.

Multiple backends may be active at the same time.

Other backends are relatively simple to implement, each requires a module exporting a Backend class, a title and a configuration schema. T

    {
        Backend : BackendClass,
        title: 'Influxdb Backend',
        schema : configschema
    };

The backend class must have a constructor of the form

        function Backend(plugin, options, config) {

        }

        Backend.prototype.close = function() {
           // dispose of any resources.
        }


    Backend.prototype.flush = function(ts, metrics) {

        // flush the metrics in metrics with a timestamp of ts. 

    }