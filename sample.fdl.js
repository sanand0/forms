this.form = {
  // This is a sample form
  "sample": {
    "fields": [
      {
        "id": 1,
        "section": "Sample form: Section 1",
        "help": "This is the first section in the sample form. You can have HTML markup in the descriptions, e.g. <strong>strong</strong>, <em>emphasis</em>, etc."
      },
      {
        "id": "date",
        "label": "Date",
        "help": "This is a a date field. On modern browsers, you can select dates. On old browsers, you have to type it in. We will enhance the UI here to make it a date selection widget.",
        "type": "date",
        "default": "today", // TODO: This is yet to be implemented
        "validations": [
            [true, 'Date cannot be blank']
        ]
      },
      {
        "id": "text",
        "label": "Text field",
        "help": "This is a simple text field. It must begin with A and end with Z.",
        "type": "text",
        "validations": [
          [true, 'Text must not be blank'],
          [/^A/i, 'Text must start with A'],
          [/Z$/i, 'Text must end with Z']
        ]
      },
      {
        "id": "textarea",
        "label": "Paragraph text",
        "help": "This lets you type in a paragraph of text",
        "type": "textarea",
        "validations": [
            [true, 'Paragraph text cannot be blank']
        ]
      },
      {
        "id": 2,
        "section": "Sample form: Section 2",
      },
      {
        "id": "select",
        "label": "Selection",
        "help": "Lets you select from a dropdown list",
        "type": "select",
        "values": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        "validations": [
            [true, 'Selection cannot be blank'],
            [['1','2','3'], 'Value must be 1, 2 or 3']
        ]
      },
      {
        "id": "file",
        "label": "File upload",
        "help": "Lets you upload a file",
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
      "submit": "Submit this form"
    }
  }
}
