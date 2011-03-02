About Forms
===========

Think Lotus Notes for the Web.

This is a simple forms & views based online application.
Clients can create forms and views using a visual interface (no programming)
and deploy it for a team.

Sample applications:

- Tracking timesheets, chargebacks, orders/proposals
- Surveys
- Exams

Creating an application
=======================
Create a folder with index.js, a JSON file that looks like this:

    { 'form': [ ... a list of forms -- see below ],
      'view': [ ... a list of views -- see below ],
      'template': 'html-file-to-use-as-a-template.html' }

This will create the following URLs:
    - `/:app/:form`     : Show form (to create new form)
    - `/:app/:form/:id` : Show existing document
    - `/:app/:view`     : Show view

Forms
========
A Form is a list of Fields and Permissions.

When in doubt, follow http://neyric.github.com/inputex/

A Field can either be:

1. a section header, in which case it has:
    - a unique `id`
    - a `section` title
    - a `help` description. Optional
2. OR a regular field, which can have:
    - a unique `id`
    - a `label` describing the field
    - a `help` description. Optional
    - a `type` that determines how the field is shown (defaults to text). This is similar to the HTML5 field types, with the addition of `textarea` and `select`
        - textarea, select, text, number, checkbox, radio, date, time, file (telephone, url, e-mail, password will be considered too)
    - a `default` value. Optional. Defaults to blank. For type `checkbox`, this can be a list.
    - `values` for the field. Required only for types `select`, `radio` and `checkbox`. This could be:
        - a list of values: `[1,2,3]`
        - OR a field from a form: `{"form": "project", "field": "name"}`
        - OR a column number from a view: `{"view": "Projects by name", "field": 0}`
    - `validations` for the field. Optional. This is a list of validations. Each validation be:
        - a boolean. `true` indicates a required field. `false` (which is the default) is an optional field
        - OR an array. `[1,2,3,4,5,6,7,8,9]` indicates numbers from 1 to 10
        - OR an array with two numbers indicates a range. `[1,10]` indicates a number range. TODO: How to specify a date range?
        - OR a regular expression. `/(one|two|three) .* birds/`
        - OR a function. `function(x) { return x*10 + 2 < 30 }`
    - `score` for the field. Optional. This determines what the "score" for the field is. Useful for quiz totals, scorecard values, etc. This could be:
        - a dictionary of values. `{'Yes': 10, 'No': 0, /Don't know/i: 5}`
        - OR a function. `function(x) { return x.match(/Yes/i) ? 10: 0 }`

Permissions may be given to users to Create, Read, Update or Delete (CRUD) forms.
Each permission can be granted to zero or more users. By default, anyone can perform any of these actions.

The following groups have a special meaning:
    - `any` indicates anyone
    - `author` indicates the author of the document
    - `admin` indicates one of the administrators

For example:
    "permissions": {
      "create": ["all"],
      "read"  : ["all"],
      "update": ["author","admin"]
      "delete": ["admin"]
    }


Views
=====
A View has:

- a `fields` list (TODO: how? just form & field?)
- a `sort` order list that lists fields in the order they should be sorted, and how they should be sorted
- a `filter` list that determines which documents should be shown
- a `page` length determining the number of records

Authentication
==============
Three forms of authentication will be supported:
1. LDAP
2. Custom
3. Google/Yahoo/Facebook/Twitter

Reports
=======

Bulk data
=========
- Bulk exports
- Bulk upload of data
- Feed import

Administration
==============


Architecture
============
- Forms and views are described using a Form Description Language, which is in JSON.
- Each form or view is rendered by a plugin that can be associated with it. Default renderers will be provided.
- URLs will have the structure:
    - /app/form/NAME?params
    - /app/view/NAME?params


Platform
========
- Node.js on the server side (since server-side validations are required)
- CouchDB for the database (since a flexible column store is required)

TODO
====
- --Delete--
- History
- Multiedit
- Better templating engine: inheritence, events
- Sort
- Auth
- Search
- Reports
- Related views (e.g. projects for a user, recent projects, etc)
- Approval process
- Email integration
