# Planning tool handoff: TM1 replacement without licence costs

Note for Claude (desktop, company machine). Read this file first, then continue
the work in the "Next steps" section. Written 2026-11-10 from a cloud session
that only had photos of the current system and no access to the company network.

## 1. What we are doing

Build an in-house planning tool that does what the company's IBM Cognos TM1
model does today (cost center, project and headcount planning), hosted on AWS,
with no IBM, Apliqo or grid-component licence fees. The decision was taken
after comparing three licensed paths (IBM Planning Analytics as a Service on
AWS Marketplace, Planning Analytics Local on EC2, Cloud Pak for Data on ROSA).
All three need an IBM entitlement, so they were rejected.

## 2. What the current system looks like (from screenshots)

Client: IBM Cognos TM1 Perspectives (German UI) with Apliqo UX on top.
Server instance name: `pase_ccs_prod`. Fiscal year runs April to March.

Cube inventory, by prefix:

| Prefix | Role | Cubes seen |
|--------|------|-----------|
| `A_WEB_` | Apliqo UX control cubes (v3.1, see `A_WEB_Start_v31`) | Chart_Configuration, Configuration, Connector_Configuration, Context, Dictionary, Navigator, Process, Profile, Resource, Set, Start |
| `cc` | configuration and master data | AttributesCostCenter, AttributesEmployee, ClientsCostCenter, ClientsEmployee, EkimuInput, EmployeeCostcenter, ExchangeRate, ExchangeRates, ExternalManpowerInput, GeneralExpenseInput, HeadcountInput, HistorizationConfiguration, MasterConfiguration, MaterialCostInput, RnDExpensesInput, SecurityUser, StaffingInput, StaticSetting, TemplateDefinition, TopProject |
| `ic` | input cubes | CostTransfer, Ekimu, ExternalManpower, GeneralExpense, HeadcountFTE, InternalManpower, MaterialCost, Provision, RnDExpense, Staffing |
| `pw` | project workflow | EmployeeCheck, ErrorMessage, FinancialRates, FinancialRatesDefault, Mapping_Project, MappingProject, Milestones, ProjectInput, ProjectReporting, Security, WorkflowNew |
| `rc` | reporting cubes | Progress, TotalExpense |
| `sc` / `s` | staging and system | ProtimeStaging, PasswordFiles, SystemAuditLog |

Reporting cube `rcTotalExpense` has nine dimensions, in this order:
`dCostCenter, dCostElement, dProject, dVersion, dScenario, dYear, dMonth,
dCurrency, dValueType`. This is the target shape of our fact table.

Employee attribute cube `ccAttributesEmployee` is dEmployee x
dAttributesEmployee x dMeasureAttribute x dYear x dMonth. Attributes:
Company, Cost center, Employee type (values like P), FTE, Function (values
like Indirect), Hourly wage rate, Overhead Cost, isAbsent, isMGMT,
isParentalLeave, Location (site codes like LNG). Each attribute has two
measures, `calculated_string` (rule-derived) and `final_string` (frozen or
overridden value). Open positions are placeholder employees named
`X_Open Position_<org>_<cost center>: <text>_<timestamp>`.

"Ekimu" is Japanese for services (役務). Protime is the time-recording
source feeding `scProtimeStaging`.

Do not copy employee names, wage rates or overhead costs from the screenshots
or the live system into this repository. Use synthetic data for development.

## 3. Agreed architecture

- Storage: PostgreSQL (RDS). One fact table per input cube keyed by the nine
  dimensions above plus `value`. Dimension tables with parent-child
  hierarchies (closure table or recursive CTE) replace TM1 consolidations.
- Calculation: Python service using Polars or DuckDB, run on demand per
  version. Replaces TM1 rules and feeders. Scheduled Python jobs on Lambda or
  ECS replace TurboIntegrator processes.
- Versions and writeback: versions are partitions of the fact tables. All
  writes go through an API that logs user, timestamp, old and new value. The
  calculated versus final override pattern is kept as two columns.
- Security: PostgreSQL row level security keyed on cost center, mirroring
  `ccSecurityUser`. SSO via the company identity provider (SAML or OIDC).
- Front end: React web app with an editable pivot grid. Use Univer
  (Apache 2.0) or TanStack Table. Do not use AG Grid Enterprise or
  Handsontable, both carry licence fees. Excel access via an Office.js add-in
  or import and export.
- Reporting: Apache Superset or Metabase on the same database replaces the
  `rc` cubes and most of Apliqo UX.
- Hosting: small RDS instance plus Fargate or Lambda, roughly 50 to 150 USD
  per month.

## 4. Phase plan

1. Phase 1 (first): headcount and staffing cost only. Schema for dimensions
   and `ccAttributesEmployee` equivalent, staffing cost calculation
   (FTE x hourly wage rate x hours + overhead), one editable grid, one
   report. Prove multi-user writeback before anything else.
2. Phase 2: remaining input cubes (external manpower, general expense,
   material cost, R&D expense, provisions, cost transfer) and the
   `rcTotalExpense` aggregation with currency conversion.
3. Phase 3: project workflow (milestones, mappings, approvals), audit log UI,
   Excel add-in.

## 5. Questions to answer on the company side before coding

- What does the current IBM licence cover and when does it expire? This sets
  the deadline.
- How many planners write back concurrently, and how many read-only users?
- Which source systems feed the model (Protime, HR system, ERP for actuals,
  exchange rates) and how can AWS reach them (VPN, Direct Connect, file drop)?
- Is Excel writeback mandatory or is a web grid plus export enough?
- Which identity provider is used for SSO?
- Can we get an export of the TM1 data directory (`.cub`, `.dim`, `.rux`,
  `.pro` files) to read the exact rules and TI logic? The `.rux` files are the
  specification for the calculation service.

## 6. Next steps for Claude desktop

1. Ask the user for the answers in section 5, especially the `.rux` rule files
   for `ccAttributesEmployee`, `icStaffing` and `rcTotalExpense`.
2. Scaffold `planning/` in this repo: `schema.sql` (dimensions, closure table,
   fact tables, audit table, RLS policies), `calc/` (Python calculation
   service with synthetic test data), `web/` (React grid).
3. Keep every commit free of real employee data.
