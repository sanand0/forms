this.form = {
  "timesheet": {
    "fields": [
      {
        "id": 1,
        "section": "Timesheet",
        "help": "Fill in the number of hours you worked for a project on one day"
      },
      {
        "id": "date",
        "label": "Date",
        "type": "date",
        "default": "today",
        "validations": [true]
      },
      {
        "id": "project",
        "label": "Project",
        "type": "text",
        "values": {"view": "Active Projects", "field": "Project" },
        "validations": [true]
      },
      {
        "id": "hours",
        "label": "Hours",
        "type": "select",
        "values": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        "validations": [true]
      },
      {
        "id": "notes",
        "label": "Notes",
        "type": "text"
      }
    ],

    "key": ["_author", "date", "project"],

    "permissions": {
      "read"  : ["all"],
      "create": ["all"],
      "update": ["author","admin"]
    },

    // "actions": {
    //   "submit": "Submit timesheet"
    // }
  },


  "project": {
    "fields": [
      {
        "id": "project",
        "label": "Project name",
        "type": "text",
        "validations": [true]
      },
      {
        "id": "hours",
        "label": "Budget allocated (hours)",
        "type": "number"
      },
      {
        "id": "status",
        "label": "Project status",
        "type": "text",
        "values": ["active", "inactive"]
      }
    ],

    "key": ["project"],

    "permissions": {
      "read"  : ["all"],
      "create": ["admin"],
      "update": ["admin"]
    },

    "actions": {
    }
  }


}

/*
,

"view": {
  "Projects": {
    "form"   : [ "project" ],
    "fields"  : [
      {"field": "project", "sortable": true, "searchable": true, "editable": true},
      {"field": "budget" , "sortable": true, "searchable": true, "editable": true},
      {"field": "status" , "sortable": true, "searchable": true, "editable": true},
    ],
    "sort"    : [ {"field": "project", "sort": 1} ],
    "filter"  : [ {"field": "project", "filter": { "status": /^active$/ } } ],
    "page"    : 50
  },

  "Active Projects": {
    "form"   : [ "project" ],
    "fields"  : [ {"field": "project" } ],
    "sort"    : [ {"field": "project", "sort": 1} ],
    "filter"  : [ {"field": "project", "filter": { "status": /^active$/ } } ],
    "page"    : 50
  }

  "Budget usage": {
    "form" : ["project", "timesheet"]
    "fields": [
      {"form": "project"
    ]
  }

}
*/
