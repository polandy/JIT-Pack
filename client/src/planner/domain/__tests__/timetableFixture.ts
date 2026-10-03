/**
 * Real answers of transport.opendata.ch (2026-10-03), cut to the fields the
 * reader uses — the passing stations, prognoses and capacities dropped. Times
 * are the stop's own local time with its offset; coordinates come as `x` =
 * latitude, `y` = longitude. Pins the shape in a unit test, as the SBB
 * link's fixture does: the day the service changes it is a red test against
 * a fresh fixture, and in the field a polite fallback.
 */
export const CONNECTIONS_FIXTURE = {
  connections: [
    {
      from: {
        station: {
          id: '8507492',
          name: 'Interlaken Ost',
        },
        departure: '2026-10-10T08:04:00+0200',
        arrival: null,
      },
      to: {
        station: {
          id: '8507374',
          name: 'Kleine Scheidegg',
        },
        departure: null,
        arrival: '2026-10-10T09:08:00+0200',
      },
      duration: '00d01:04:00',
      transfers: 1,
      products: ['R'],
      sections: [
        {
          journey: {
            category: 'R',
            number: '62',
          },
          walk: null,
          departure: {
            station: {
              id: '8507492',
              name: 'Interlaken Ost',
            },
            departure: '2026-10-10T08:04:00+0200',
            arrival: null,
          },
          arrival: {
            station: {
              id: '8507384',
              name: 'Lauterbrunnen',
            },
            departure: null,
            arrival: '2026-10-10T08:26:00+0200',
          },
        },
        {
          journey: {
            category: 'CC',
            number: '63',
          },
          walk: null,
          departure: {
            station: {
              id: '8507384',
              name: 'Lauterbrunnen',
            },
            departure: '2026-10-10T08:30:00+0200',
            arrival: '2026-10-10T08:26:00+0200',
          },
          arrival: {
            station: {
              id: '8507374',
              name: 'Kleine Scheidegg',
            },
            departure: null,
            arrival: '2026-10-10T09:08:00+0200',
          },
        },
      ],
    },
    {
      from: {
        station: {
          id: '8507492',
          name: 'Interlaken Ost',
        },
        departure: '2026-10-10T08:34:00+0200',
        arrival: null,
      },
      to: {
        station: {
          id: '8507374',
          name: 'Kleine Scheidegg',
        },
        departure: null,
        arrival: '2026-10-10T09:38:00+0200',
      },
      duration: '00d01:04:00',
      transfers: 1,
      products: ['R'],
      sections: [
        {
          journey: {
            category: 'R',
            number: '62',
          },
          walk: null,
          departure: {
            station: {
              id: '8507492',
              name: 'Interlaken Ost',
            },
            departure: '2026-10-10T08:34:00+0200',
            arrival: null,
          },
          arrival: {
            station: {
              id: '8507384',
              name: 'Lauterbrunnen',
            },
            departure: null,
            arrival: '2026-10-10T08:56:00+0200',
          },
        },
        {
          journey: {
            category: 'CC',
            number: '63',
          },
          walk: null,
          departure: {
            station: {
              id: '8507384',
              name: 'Lauterbrunnen',
            },
            departure: '2026-10-10T09:00:00+0200',
            arrival: '2026-10-10T08:56:00+0200',
          },
          arrival: {
            station: {
              id: '8507374',
              name: 'Kleine Scheidegg',
            },
            departure: null,
            arrival: '2026-10-10T09:38:00+0200',
          },
        },
      ],
    },
    {
      from: {
        station: {
          id: '8507000',
          name: 'Bern',
        },
        departure: '2026-10-10T08:04:00+0200',
        arrival: null,
      },
      to: {
        station: {
          id: '8507384',
          name: 'Lauterbrunnen',
        },
        departure: null,
        arrival: '2026-10-10T09:26:00+0200',
      },
      duration: '00d01:22:00',
      transfers: 1,
      products: ['IC 81', 'R'],
      sections: [
        {
          journey: {
            category: 'IC',
            number: '81',
          },
          walk: null,
          departure: {
            station: {
              id: '8507000',
              name: 'Bern',
            },
            departure: '2026-10-10T08:04:00+0200',
            arrival: null,
          },
          arrival: {
            station: {
              id: '8507492',
              name: 'Interlaken Ost',
            },
            departure: null,
            arrival: '2026-10-10T08:59:00+0200',
          },
        },
        {
          journey: {
            category: 'R',
            number: '62',
          },
          walk: null,
          departure: {
            station: {
              id: '8507492',
              name: 'Interlaken Ost',
            },
            departure: '2026-10-10T09:04:00+0200',
            arrival: '2026-10-10T08:59:00+0200',
          },
          arrival: {
            station: {
              id: '8507384',
              name: 'Lauterbrunnen',
            },
            departure: null,
            arrival: '2026-10-10T09:26:00+0200',
          },
        },
      ],
    },
    {
      from: {
        station: {
          id: '8507000',
          name: 'Bern',
        },
        departure: '2026-10-10T08:34:00+0200',
        arrival: null,
      },
      to: {
        station: {
          id: '8507384',
          name: 'Lauterbrunnen',
        },
        departure: null,
        arrival: '2026-10-10T09:56:00+0200',
      },
      duration: '00d01:22:00',
      transfers: 1,
      products: ['IC 61', 'R'],
      sections: [
        {
          journey: {
            category: 'IC',
            number: '61',
          },
          walk: null,
          departure: {
            station: {
              id: '8507000',
              name: 'Bern',
            },
            departure: '2026-10-10T08:34:00+0200',
            arrival: null,
          },
          arrival: {
            station: {
              id: '8507492',
              name: 'Interlaken Ost',
            },
            departure: null,
            arrival: '2026-10-10T09:28:00+0200',
          },
        },
        {
          journey: {
            category: 'R',
            number: '62',
          },
          walk: null,
          departure: {
            station: {
              id: '8507492',
              name: 'Interlaken Ost',
            },
            departure: '2026-10-10T09:34:00+0200',
            arrival: '2026-10-10T09:28:00+0200',
          },
          arrival: {
            station: {
              id: '8507384',
              name: 'Lauterbrunnen',
            },
            departure: null,
            arrival: '2026-10-10T09:56:00+0200',
          },
        },
      ],
    },
    {
      from: {
        station: {
          id: '8507000',
          name: 'Bern',
        },
        departure: '2026-10-10T09:04:00+0200',
        arrival: null,
      },
      to: {
        station: {
          id: '8507384',
          name: 'Lauterbrunnen',
        },
        departure: null,
        arrival: '2026-10-10T10:26:00+0200',
      },
      duration: '00d01:22:00',
      transfers: 1,
      products: ['ICE', 'R'],
      sections: [
        {
          journey: {
            category: 'ICE',
            number: '000271',
          },
          walk: null,
          departure: {
            station: {
              id: '8507000',
              name: 'Bern',
            },
            departure: '2026-10-10T09:04:00+0200',
            arrival: null,
          },
          arrival: {
            station: {
              id: '8507492',
              name: 'Interlaken Ost',
            },
            departure: null,
            arrival: '2026-10-10T09:59:00+0200',
          },
        },
        {
          journey: {
            category: 'R',
            number: '62',
          },
          walk: null,
          departure: {
            station: {
              id: '8507492',
              name: 'Interlaken Ost',
            },
            departure: '2026-10-10T10:04:00+0200',
            arrival: '2026-10-10T09:59:00+0200',
          },
          arrival: {
            station: {
              id: '8507384',
              name: 'Lauterbrunnen',
            },
            departure: null,
            arrival: '2026-10-10T10:26:00+0200',
          },
        },
      ],
    },
  ],
}

export const LOCATIONS_FIXTURE = {
  stations: [
    {
      id: '8507384',
      name: 'Lauterbrunnen',
      score: null,
      coordinate: {
        type: 'WGS84',
        x: 46.59842,
        y: 7.908077,
      },
      distance: null,
      icon: 'train',
    },
    {
      id: '8571318',
      name: 'Lauterbrunnen, Bahnhof',
      score: null,
      coordinate: {
        type: 'WGS84',
        x: 46.598962,
        y: 7.907559,
      },
      distance: null,
      icon: 'bus',
    },
    {
      id: '8580370',
      name: 'Lauterbrunnen, Dorf',
      score: null,
      coordinate: {
        type: 'WGS84',
        x: 46.595337,
        y: 7.907424,
      },
      distance: null,
      icon: 'bus',
    },
    {
      id: '8571319',
      name: 'Lauterbrunnen, Ey',
      score: null,
      coordinate: {
        type: 'WGS84',
        x: 46.593432,
        y: 7.909156,
      },
      distance: null,
      icon: 'bus',
    },
  ],
}

/** Around 46.6 N, 7.9 E: an address without an id first, then stops by distance. */
export const NEAR_FIXTURE = {
  stations: [
    {
      id: null,
      name: 'Alpweg 76b, Lauterbrunnen',
      score: null,
      coordinate: {
        type: 'WGS84',
        x: null,
        y: null,
      },
      distance: 20.228669431898314,
      icon: null,
    },
    {
      id: '8507377',
      name: 'Lauterbrunnen (Seilbahn)',
      score: null,
      coordinate: {
        type: 'WGS84',
        x: 46.598747,
        y: 7.907166,
      },
      distance: 566,
      icon: null,
    },
    {
      id: '8571318',
      name: 'Lauterbrunnen, Bahnhof',
      score: null,
      coordinate: {
        type: 'WGS84',
        x: 46.598962,
        y: 7.907559,
      },
      distance: 591,
      icon: 'bus',
    },
    {
      id: '8507384',
      name: 'Lauterbrunnen',
      score: null,
      coordinate: {
        type: 'WGS84',
        x: 46.59842,
        y: 7.908077,
      },
      distance: 643,
      icon: 'train',
    },
  ],
}
