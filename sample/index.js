{
  "template": {
    "default": "index.html"
  },

  "form": {
    "sample": {
      "fields": [
        {
          "name": 1,
          "section": "Sample form: Section 1",
          "description": "This is the first section in the sample form. You can have HTML markup in the descriptions, e.g. <strong>strong</strong>, <em>emphasis</em>, etc."
        },
        {
          "name": "date",
          "label": "Date",
          "description": "This is a a date field. On modern browsers, you can select dates. On old browsers, you have to type it in. We will enhance the UI here to make it a date selection widget.",
          "type": "date",
          "default": "today",
          "validations": [
              [true, "Date cannot be blank"]
          ]
        },
        {
          "name": "text",
          "label": "Text field",
          "description": "This is a simple text field. It must begin with A and end with Z.",
          "type": "text",
          "validations": [
            [true, "Text must not be blank"],
            ["/^A/i", "Text must start with A"],
            ["/Z$/i", "Text must end with Z"]
          ]
        },
        {
          "name": "textarea",
          "label": "Paragraph text",
          "description": "This lets you type in a paragraph of text",
          "type": "textarea",
          "validations": [
              [true, "Paragraph text cannot be blank"]
          ]
        },
        {
          "name": 2,
          "section": "Sample form: Section 2"
        },
        {
          "name": "select",
          "label": "Selection",
          "description": "Lets you select from a dropdown list",
          "type": "select",
          "values": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          "validations": [
              [true, "Selection cannot be blank"],
              [["1","2","3"], "Value must be 1, 2 or 3"]
          ]
        },
        {
          "name": "file",
          "label": "File upload",
          "description": "Lets you upload a file",
          "type": "file"
        }
      ],

      "key": [],

      "permissions": {
        "read"  : ["all"],
        "create": ["all"],
        "update": ["author","admin"]
      },

      "actions": {
        "onSubmit": "/samples"
      }
    },

    "another": {
      "fields": [
        {
          "name": "date",
          "label": "Date",
          "description": "This is a a date field. On modern browsers, you can select dates. On old browsers, you have to type it in. We will enhance the UI here to make it a date selection widget.",
          "type": "date",
          "default": "today",
          "validations": [
              [true, "Date cannot be blank"]
          ]
        },
        {
          "name": "text",
          "label": "Text field",
          "description": "This is a simple text field. It must begin with A and end with Z.",
          "type": "text",
          "validations": [
            [true, "Text must not be blank"],
            ["/^A/i", "Text must start with A"],
            ["/Z$/i", "Text must end with Z"]
          ]
        },
        {
          "name": "textarea",
          "label": "Paragraph text",
          "description": "This lets you type in a paragraph of text",
          "type": "textarea",
          "validations": [
              [true, "Paragraph text cannot be blank"]
          ]
        },
        {
          "name": 2,
          "section": "Sample form: Section 2"
        },
        {
          "name": "select",
          "label": "Selection",
          "description": "Lets you select from a dropdown list",
          "type": "select",
          "values": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          "validations": [
              [true, "Selection cannot be blank"],
              [["1","2","3"], "Value must be 1, 2 or 3"]
          ]
        },
        {
          "name": "file",
          "label": "File upload",
          "description": "Lets you upload a file",
          "type": "file"
        }
      ],

      "key": [],

      "permissions": {
        "read"  : ["all"],
        "create": ["all"],
        "update": ["author","admin"]
      },

      "actions": {
        "onSubmit": "/samples"
      }
    }

  },

  "view": {
    "samples": {
      "form": "sample",
      "fields": [
        { "name": "date",     "label": "Date"     },
        { "name": "text",     "label": "Text"     },
        { "name": "textarea", "label": "Para"     },
        { "name": "select",   "label": "Number"   }
      ]
    }
  }
}
