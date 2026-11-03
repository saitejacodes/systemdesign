# On-call and Incident Response

## Who is on call

Engineers in the cloud platform, firmware release and device fleet teams take part in on-call rotations once they have completed three months of service and shadowed two full shifts. Each rotation has a primary and a secondary engineer. A rotation lasts one week, starting Tuesday at 10:00, so that handovers happen in core hours and not on a Monday after a weekend.

## On-call pay

Engineers on call receive a standby payment of 40 per weekday night and 90 per weekend day or public holiday. If you are paged and work on an incident outside your normal hours, you also earn TOIL equal to the time spent, rounded up to the next half hour. Nobody should be on call for more than one week in four.

## Response times

When you are paged, acknowledge the page within 15 minutes. If the primary does not acknowledge within 15 minutes, the page goes to the secondary, and after a further 15 minutes it goes to the engineering manager on duty. You must be able to reach a laptop and a stable connection within 30 minutes while on call.

## Severity levels

SEV1 means customers cannot receive alarm data from their instruments, or a safety alert may be delayed. SEV2 means a major feature is broken for many customers, but alarm delivery works. SEV3 means a minor problem with a workaround. A SEV1 must be declared in the incident channel immediately, and an incident commander must be named within ten minutes. Gas detector alarm delivery is always treated as SEV1, whatever the number of customers affected.

## Running an incident

The incident commander coordinates and does not debug. A separate communications lead updates the status page every 30 minutes during a SEV1. Write down what you try and when in the incident channel, because the timeline is needed afterwards.

## After the incident

Every SEV1 and SEV2 incident has a blameless review within five working days. The review produces a written timeline, the contributing causes, and actions with owners and dates. The aim is to fix systems and processes, not to find a person to blame.

## Rest after incidents

If you are paged between midnight and 06:00 and work for more than an hour, start late the next day by at least as long as you worked. You do not need to ask permission; just tell your team.

Policy owner: VP Engineering.
