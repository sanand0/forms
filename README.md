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

A simple contact manager
========================
Create a folder called `contacts` with the following `index.js` (a JSON file):

    {
      "form": {
        "person": {
          "fields": [
            { "name": "firstname", "label": "First name" },
            { "name": "lastname", "label": "Last name" },
            { "phone": "phone", "label": "Phone", "type": "phone" },
            { "birthday": "birthday", "label": "Birthday", "type": "date" }
          ],
          "onsubmit": "/persons"
        }
      },
      "view": {
        "persons": {
          "form": "person",
          "fields": [
            { "name": "firstname", "label": "First name" },
            { "name": "lastname", "label": "Last name" },
            { "name": "phone", "label": "Phone" }
          ],
          "actions": [
            { "text": "Add new person", "url": "/person" }
          ]
        }
      }
    }

Now create an `index.html` that has:

    <!doctype html>
    <html>
    <head><title>Contacts</title></head>
    <body>

    <%= forms %>
    <%= views %>
    <%= form %>
    <%= view %>
    <%= actions %>
    <%= hist %>

    </body></html>

This will create the following URLs:
    - `/:app/:form      : Show form (to create new form)
    - `/:app/:form/:id` : Show existing document
    - `/:app/:view`     : Show view

Creating a form
===============

    "{ form_name }": {
      "fields": [
        {
          "section":    "{ required: section title }",
          "help":       "{ optional: section description }"
        },

        {
          "name":       "{ required: database name of the field }",
          "label":      "{ required: text label to display against the field }",
          "help":       "{ optional: detailed field help }",
          "type":       "{ optional: input|radio|checkbox|textarea|select|computed }",

          // Values specify the list of values for a field.
          // They are required only for `select`,  `radio` and `checkbox`.
          // The values can be specified as a list:
          "values":     [1,2,3,"list","of","values"],

          //... or as a lookup into another form
          "values":     {"form": "{ form to look up }", "field": "{ field to look up in form }",

          // Validations are an optional list.
          // All validatations in the list must evaluate to true for the field to validate
          "validations": [
            // A validation of `true` indicates a required field
            true,

            // an array indicates a list of valid values
            [1,2,3,4,5,6,7,8,9],

            // a string indicates a regular expression.
            '/(one|two|three) .* birds/'
          ]

      ]
    }


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
- --Export--
- --History--
- Export content-disposition
- View pagination
- Access restriction
- Use express.js for routing
- Login: custom.
- Better templating engine: inheritence, events
- --Sort--
- Reports
- Login: via LDAP
- Search
- Related views (e.g. projects for a user, recent projects, etc)
- Approval process
- Email integration
- External integration (e.g. JIRA)
- Multiedit


urls:
    POST /:app/:form                Create if no [_id] or [_rev]
                                    Update if [_id] and [_rev]
                                    Delete if [_delete]
                                    Works on 0 or more documents

    GET  /:app/:form                Show blank form
    GET  /:app/:form?field=val      Show form with fields populated
    GET  /:app/:form/:id            Show document
    GET  /:app/:form/:id?field=val  Show document with fields overridden

    GET  /:app/:view/               Show view
    GET  /:app/:view/?options       Show view with
                                        fields=field1,field2,...
                                        sort=+field1,-field2,...
                                        :field=val
                                        :field=<val
                                        :field=>val

... how do I stitch these together as renderers?

# Client: a dropdown
# Services: initial list as dropdown
# Proposal status: Pending, Won, Lost
# Order status: Accepted, Requested modification, Rejected
# Opportunity > Source: (dropdown)
# Change first section heading from proposal -> something else

# Computed fields:
#     Server side computation
#     Client side compuation
    Save computed fields

Common Javascript libraries, inherited from a global app template

Multiviews: Display opportunities, proposals, orders separately -- based on status.
    View filters

Conditional fields / sections: Once proposal status becomes Won, need to populate order number. [Mandatory]

Totals in views:
    Total value at the bottom -- for contract value as well as expected value
    Total count of number of proposals -- pending, complete, etc.

Custom views: Statistics on how many orders / month, etc.
